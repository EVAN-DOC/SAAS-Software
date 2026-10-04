const express = require("express");
const config = require("../config");
const icarryService = require("../services/icarryService");
const manualOrderStore = require("../lib/manualOrderStore");

const router = express.Router();

const TAG_LABELS = {
  INF: "Influencer",
  FAM: "Family",
  COMP: "Complimentary",
  CUST: "Customer",
};

// Hyperlocal has no booking endpoint in icarryService.js (only surface/air —
// see its bookShipment doc comment) and its /api_get_estimate `shipment_mode`
// behavior isn't confirmed either, unlike S/A which are used live elsewhere
// in this app. Rejected here rather than silently mis-booking or guessing.
const SUPPORTED_MODES = new Set(["S", "A"]);

function validateConsignee(c) {
  const errors = [];
  if (!c?.name?.trim()) errors.push("Consignee name is required");
  if (!/^\d{10}$/.test(c?.mobile || "")) errors.push("Consignee mobile must be exactly 10 digits");
  if (!c?.address?.trim()) errors.push("Consignee address is required");
  if (!/^\d{6}$/.test(c?.pincode || "")) errors.push("Consignee pincode must be 6 digits");
  if (!c?.city?.trim()) errors.push("Consignee city is required");
  if (!c?.state?.trim()) errors.push("Consignee state is required");
  return errors;
}

function validateParcel(p) {
  const errors = [];
  if (!p?.contents?.trim()) errors.push("Parcel contents are required");
  if (!(Number(p?.weightGrams) > 0)) errors.push("Parcel weight must be greater than 0");
  if (!(Number(p?.declaredValue) >= 0)) errors.push("Declared value is required");
  if (!(Number(p?.lengthCm) > 0) || !(Number(p?.breadthCm) > 0) || !(Number(p?.heightCm) > 0)) {
    errors.push("Parcel dimensions must all be greater than 0");
  }
  return errors;
}

/** Config the frontend needs to render the form — never a second, fabricated pickup address; only what's actually configured. */
router.get("/meta", (req, res) => {
  res.json({
    mock: config.mockMode,
    bookingEnabled: config.mockMode || Boolean(config.icarry.pickupAddressId),
    pickupAddressId: config.icarry.pickupAddressId || null,
    originPincode: config.icarry.originPincode || null,
    tags: Object.entries(TAG_LABELS).map(([tag, label]) => ({ tag, label })),
  });
});

router.get("/next-reference", (req, res) => {
  const tag = String(req.query.tag || "").toUpperCase();
  if (!TAG_LABELS[tag]) return res.status(400).json({ error: `Unknown tag "${tag}"` });
  res.json({ reference: manualOrderStore.nextReference(tag) });
});

router.post("/estimate", async (req, res, next) => {
  try {
    const { pincode, weightGrams, lengthCm, breadthCm, heightCm, declaredValue, mode, isCod } = req.body;

    if (config.mockMode) {
      return res.json({
        success: 1,
        estimate: [
          { courier_id: "1", courier_name: "Amazon Shipping", courier_group_name: "Amazon Shipping", courier_cost: "35.68" },
          { courier_id: "2", courier_name: "Ekart", courier_group_name: "Ekart", courier_cost: "40.14" },
        ],
      });
    }

    if (!config.icarry.originPincode) {
      return res.status(412).json({
        error: "Estimates are disabled — set ICARRY_ORIGIN_PINCODE in server/.env to your iCarry pickup address's pincode first.",
      });
    }
    if (!/^\d{6}$/.test(pincode || "")) return res.status(400).json({ error: "A valid 6-digit destination pincode is required" });
    if (!(Number(weightGrams) > 0)) return res.status(400).json({ error: "Weight is required" });
    if (!SUPPORTED_MODES.has(mode)) return res.status(400).json({ error: `Unsupported mode "${mode}" — only Surface (S) and Air (A) are wired to a real estimate.` });

    const result = await icarryService.getEstimate({
      lengthCm: Number(lengthCm) || 15,
      breadthCm: Number(breadthCm) || 12,
      heightCm: Number(heightCm) || 5,
      weightGrams: Number(weightGrams),
      originPincode: config.icarry.originPincode,
      destinationPincode: pincode,
      shipmentType: isCod ? "C" : "P",
      shipmentValue: Number(declaredValue) || 0,
      mode,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// REAL, consequential action — see icarryService.bookShipment's doc comment.
// Refused outright unless ICARRY_PICKUP_ADDRESS_ID is set (same gate as the
// Shopify-order booking flow in routes/shipments.js).
router.post("/book", async (req, res, next) => {
  try {
    if (!config.mockMode && !config.icarry.pickupAddressId) {
      return res.status(412).json({
        error: "Booking is disabled — set ICARRY_PICKUP_ADDRESS_ID in server/.env to your iCarry pickup address id first.",
      });
    }

    const { tag, note, consignee, parcel, mode, payment, courierId, courierName, returnAddressId, rtoAddressId } = req.body;

    if (!TAG_LABELS[tag]) return res.status(400).json({ error: `Unknown tag "${tag}"` });
    if (!SUPPORTED_MODES.has(mode)) return res.status(400).json({ error: `Unsupported mode "${mode}"` });
    if (!courierId) return res.status(400).json({ error: "courierId is required (from the /estimate response)" });

    const errors = [...validateConsignee(consignee), ...validateParcel(parcel)];
    const isCod = payment?.type === "COD";
    if (isCod && !(Number(payment?.codAmount) > 0)) errors.push("COD amount to collect is required");
    if (errors.length) return res.status(400).json({ error: errors.join("; ") });

    const reference = manualOrderStore.nextReference(tag);

    const bookingPayload = {
      pickupAddressId: config.icarry.pickupAddressId,
      clientOrderId: reference,
      courierId,
      mode: mode === "A" ? "air" : "surface",
      returnAddressId: returnAddressId || undefined,
      rtoAddressId: rtoAddressId || undefined,
      consignee: {
        name: consignee.name.trim(),
        mobile: consignee.mobile,
        address: consignee.address.trim(),
        city: consignee.city.trim(),
        pincode: consignee.pincode,
        state: consignee.state,
        country_code: "IN",
      },
      parcel: {
        type: isCod ? "COD" : "Prepaid",
        value: isCod ? Number(payment.codAmount) : Number(parcel.declaredValue),
        currency: "INR",
        contents: parcel.contents.trim().slice(0, 255),
        dimensions: { length: Number(parcel.lengthCm), breadth: Number(parcel.breadthCm), height: Number(parcel.heightCm), unit: "cm" },
        weight: { weight: Number(parcel.weightGrams), unit: "gm" },
      },
    };

    let result;
    if (config.mockMode) {
      const sid = 7400000 + Math.floor(Math.random() * 99999);
      result = {
        success: "1",
        shipment_id: sid,
        courier_id: courierId,
        courier_name: courierName || "Mock Courier",
        awb: `ICY${isCod ? "C" : "P"}${String(sid).padStart(10, "0")}`,
      };
    } else {
      result = await icarryService.bookShipment(bookingPayload);
      if (!result?.shipment_id) {
        return res.status(502).json({ error: result?.error || "iCarry did not return a shipment_id", raw: result });
      }
    }

    manualOrderStore.saveOrder(reference, {
      tag,
      label: TAG_LABELS[tag],
      note: note || null,
      consignee: bookingPayload.consignee,
      parcel: bookingPayload.parcel,
      mode,
      payment: isCod ? { type: "COD", codAmount: Number(payment.codAmount) } : { type: "NONE" },
      shipmentId: String(result.shipment_id),
      awb: result.awb ? String(result.awb) : null,
      courierName: result.courier_name || courierName || null,
      trackingUrl: result.tracking_url || null,
      bookedAt: new Date().toISOString(),
    });

    res.json({ ...result, reference });
  } catch (err) {
    next(err);
  }
});

// Read-only — retrieves the label for an already-booked manual shipment.
router.get("/:reference/label", async (req, res, next) => {
  try {
    const order = manualOrderStore.getOrder(req.params.reference);
    if (!order) return res.status(404).json({ error: "Unknown manual order reference" });
    const result = await icarryService.printShipmentLabel(order.shipmentId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Read-only — current iCarry tracking status for an already-booked manual shipment.
router.get("/:reference/track", async (req, res, next) => {
  try {
    const order = manualOrderStore.getOrder(req.params.reference);
    if (!order) return res.status(404).json({ error: "Unknown manual order reference" });
    const result = await icarryService.trackShipment(order.shipmentId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
