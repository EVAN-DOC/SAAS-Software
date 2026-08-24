const express = require("express");
const config = require("../config");
const { getShippingList } = require("../aggregator/buildShipping");
const { getEnrichedOrders } = require("../aggregator/enrichOrders");
const icarryService = require("../services/icarryService");
const shopifyService = require("../services/shopifyService");
const icarryShipmentMap = require("../lib/icarryShipmentMap");
const icarryAwbMap = require("../lib/icarryAwbMap");
const icarryReturnMap = require("../lib/icarryReturnMap");
const { invalidate } = require("../lib/cache");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const { shipments, kpis, mock } = await getShippingList();
    res.json({ shipments, kpis, mock, bookingEnabled: Boolean(config.icarry.pickupAddressId) });
  } catch (err) {
    next(err);
  }
});

async function findEnrichedOrder(orderId) {
  const records = await getEnrichedOrders();
  return records.find((r) => r.shopifyOrder.name === orderId) || null;
}

// Real courier options + cost for this order's actual parcel — read-only.
router.post("/:orderId/estimate", async (req, res, next) => {
  try {
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

    const record = await findEnrichedOrder(req.params.orderId);
    if (!record) return res.status(404).json({ error: "Order not found" });
    const { shopifyOrder } = record;
    const destinationPincode = shopifyOrder.shipping_address?.zip;
    if (!destinationPincode) return res.status(400).json({ error: "Order has no shipping pincode" });

    const weightGrams = (shopifyOrder.line_items || []).reduce((s, li) => s + (Number(li.grams) || 0) * (li.quantity || 1), 0) || 500;
    const isPartial = shopifyOrder.financial_status === "partially_paid";
    const isCod = shopifyOrder.financial_status !== "paid";

    const result = await icarryService.getEstimate({
      lengthCm: 15,
      breadthCm: 12,
      heightCm: 5,
      weightGrams,
      originPincode: config.icarry.originPincode,
      destinationPincode,
      shipmentType: isPartial || isCod ? "C" : "P",
      shipmentValue: Number(shopifyOrder.current_total_price ?? shopifyOrder.total_price ?? 0),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// REAL, consequential action — books an actual shipment with a courier and
// spends money. Refused outright unless ICARRY_PICKUP_ADDRESS_ID is set.
router.post("/:orderId/book", async (req, res, next) => {
  try {
    if (!config.icarry.pickupAddressId) {
      return res.status(412).json({
        error: "Booking is disabled — set ICARRY_PICKUP_ADDRESS_ID in server/.env to your iCarry pickup address id first.",
      });
    }
    const { courierId } = req.body;
    if (!courierId) return res.status(400).json({ error: "courierId is required (from the /estimate response)" });

    const record = await findEnrichedOrder(req.params.orderId);
    if (!record) return res.status(404).json({ error: "Order not found" });
    const { shopifyOrder } = record;
    const addr = shopifyOrder.shipping_address;
    if (!addr) return res.status(400).json({ error: "Order has no shipping address" });

    const isCod = shopifyOrder.financial_status !== "paid";
    const total = Number(shopifyOrder.current_total_price ?? shopifyOrder.total_price ?? 0);
    const weightGrams = (shopifyOrder.line_items || []).reduce((s, li) => s + (Number(li.grams) || 0) * (li.quantity || 1), 0) || 500;
    const contents = (shopifyOrder.line_items || []).map((li) => li.title).join(", ").slice(0, 255) || "Merchandise";

    const result = await icarryService.bookShipment({
      pickupAddressId: config.icarry.pickupAddressId,
      clientOrderId: shopifyOrder.name,
      courierId,
      consignee: {
        name: addr.name || [addr.first_name, addr.last_name].filter(Boolean).join(" "),
        mobile: (addr.phone || "").replace(/\D/g, "").slice(-10),
        address: [addr.address1, addr.address2].filter(Boolean).join(", "),
        city: addr.city,
        pincode: addr.zip,
        state: addr.province_code,
        country_code: "IN",
      },
      parcel: {
        type: isCod ? "COD" : "Prepaid",
        value: total,
        currency: "INR",
        contents,
        dimensions: { length: 15, breadth: 12, height: 5, unit: "cm" },
        weight: { weight: weightGrams, unit: "gm" },
      },
    });

    if (result?.shipment_id) {
      icarryShipmentMap.setShipmentId(shopifyOrder.name, String(result.shipment_id));
      if (result.awb) icarryAwbMap.setAwb(shopifyOrder.name, String(result.awb));
      invalidate("enriched");
      invalidate("dashboard");
      invalidate("shipping");

      // Best-effort — a quiet admin-only reference, not required for the booking itself.
      try {
        await shopifyService.setIcarryReferenceMetafields(shopifyOrder.id, {
          shipmentId: result.shipment_id,
          awb: result.awb,
          courierName: result.courier_name,
          trackingUrl: result.tracking_url,
        });
      } catch (metaErr) {
        console.warn(`[shopify] Couldn't write iCarry reference metafields for ${shopifyOrder.name}: ${metaErr.message}`);
      }
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Read-only — retrieves the label for an already-booked shipment.
router.get("/:orderId/label", async (req, res, next) => {
  try {
    const shipmentId = icarryShipmentMap.getShipmentId(req.params.orderId);
    if (!shipmentId) return res.status(404).json({ error: "This order has no iCarry shipment yet" });
    const result = await icarryService.printShipmentLabel(shipmentId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// REAL, consequential action — books a reverse pickup for an already-
// delivered shipment (iCarry's REVERSE Shipment API) and generates a new AWB
// for the return leg.
router.post("/:orderId/return-pickup", async (req, res, next) => {
  try {
    const orderId = req.params.orderId;
    const existing = icarryReturnMap.getReturnPickup(orderId);
    if (existing) return res.status(409).json({ error: "A return pickup is already scheduled for this order", ...existing });

    if (config.mockMode) {
      const info = {
        awb: `RTN${1000000 + Math.floor(Math.random() * 900000)}`,
        courierName: "Delhivery",
        trackingUrl: null,
        pickupId: `mock-${Date.now()}`,
        scheduledAt: new Date().toISOString(),
      };
      icarryReturnMap.setReturnPickup(orderId, info);
      return res.json({ success: "Successfully generated reverse pickup shipment (mock)", ...info });
    }

    const shipmentId = icarryShipmentMap.getShipmentId(orderId);
    if (!shipmentId) return res.status(404).json({ error: "This order has no iCarry shipment yet" });

    const result = await icarryService.reverseShipment(shipmentId);
    if (result?.error) return res.status(400).json({ error: result.error });

    const info = {
      awb: result.awb ? String(result.awb) : null,
      courierName: result.courier_name || null,
      trackingUrl: result.tracking_url || null,
      pickupId: result.pickup_id ? String(result.pickup_id) : null,
      scheduledAt: new Date().toISOString(),
    };
    icarryReturnMap.setReturnPickup(orderId, info);
    invalidate("enriched");
    invalidate("dashboard");
    invalidate("shipping");

    res.json({ ...result, ...info });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
