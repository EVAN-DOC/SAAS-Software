"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "./Sidebar";
import styles from "@/app/manual/ManualOrder.module.css";
import {
  bookManualOrder,
  fetchManualEstimate,
  fetchManualLabel,
  fetchManualOrderMeta,
  fetchManualTracking,
  fetchNextManualReference,
} from "@/lib/api";
import { CourierOption, ManualConsignee, ManualOrderMeta, ManualOrderTag, ManualParcel, ManualPaymentType, ManualShipMode } from "@/lib/types";

const STATES: [string, string][] = [
  ["AN", "Andaman & Nicobar"], ["AP", "Andhra Pradesh"], ["AR", "Arunachal Pradesh"], ["AS", "Assam"],
  ["BI", "Bihar"], ["CH", "Chandigarh"], ["CG", "Chattisgarh"], ["DA", "Dadra & Nagar Haveli"], ["DM", "Daman & Diu"],
  ["DE", "Delhi"], ["GO", "Goa"], ["GU", "Gujarat"], ["HA", "Haryana"], ["HP", "Himachal Pradesh"], ["JA", "Jammu & Kashmir"],
  ["JH", "Jharkhand"], ["KA", "Karnataka"], ["KE", "Kerala"], ["LA", "Ladakh"], ["LI", "Lakshadweep"], ["MP", "Madhya Pradesh"],
  ["MA", "Maharashtra"], ["MN", "Manipur"], ["ME", "Meghalaya"], ["MI", "Mizoram"], ["NA", "Nagaland"], ["OD", "Odisha"],
  ["PO", "Puducherry"], ["PU", "Punjab"], ["RA", "Rajasthan"], ["SI", "Sikkim"], ["TN", "Tamil Nadu"], ["TS", "Telangana"],
  ["TR", "Tripura"], ["UP", "Uttar Pradesh"], ["UK", "Uttarakhand"], ["WB", "West Bengal"],
];

const MODE_NOTE: Record<ManualShipMode, string> = {
  S: "Standard road transport.",
  A: "Faster, costs more.",
  H: "Not wired to a booking endpoint yet — iCarry has no hyperlocal API in this app. Pick Surface or Air to actually book.",
};

const DEFAULT_CONSIGNEE: ManualConsignee = {
  name: "", mobile: "", altMobile: "", email: "", address: "", city: "", state: "KA", pincode: "",
};

const DEFAULT_PARCEL: ManualParcel = {
  contents: "1 x NOS Oversized T-Shirt", weightGrams: 260, declaredValue: 999, lengthCm: 12, breadthCm: 23, heightCm: 3,
};

interface BookDone {
  reference: string;
  shipmentId: string;
  awb: string;
  courierName: string;
  codLabel: string;
}

export default function ManualOrderDashboard() {
  const [meta, setMeta] = useState<ManualOrderMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);

  const [tag, setTag] = useState<ManualOrderTag>("INF");
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");

  const [returnAddressId, setReturnAddressId] = useState("");
  const [rtoAddressId, setRtoAddressId] = useState("");

  const [consignee, setConsignee] = useState<ManualConsignee>(DEFAULT_CONSIGNEE);
  const [parcel, setParcel] = useState<ManualParcel>(DEFAULT_PARCEL);
  const [mode, setMode] = useState<ManualShipMode>("S");
  const [paymentType, setPaymentType] = useState<ManualPaymentType>("NONE");
  const [codAmount, setCodAmount] = useState("");

  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [rates, setRates] = useState<CourierOption[] | null>(null);
  const [ratesLoading, setRatesLoading] = useState(false);
  const [ratesError, setRatesError] = useState<string | null>(null);
  const [selectedCourier, setSelectedCourier] = useState<CourierOption | null>(null);

  const [booking, setBooking] = useState(false);
  const [bookDone, setBookDone] = useState<BookDone | null>(null);
  const [trackResult, setTrackResult] = useState<string | null>(null);
  const [toast, setToastMsg] = useState<string | null>(null);

  function showToast(msg: string) {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 2600);
  }

  useEffect(() => {
    fetchManualOrderMeta()
      .then(setMeta)
      .catch((err) => setMetaError(err instanceof Error ? err.message : "Couldn't load settings"));
  }, []);

  useEffect(() => {
    fetchNextManualReference(tag)
      .then(setReference)
      .catch(() => setReference(`${tag}-001`));
  }, [tag]);

  function clearRates() {
    setRates(null);
    setRatesError(null);
    setSelectedCourier(null);
  }

  // Any change to what a quote was actually priced against invalidates it —
  // never let a stale rate get booked against different parcel/destination details.
  useEffect(() => {
    clearRates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consignee.pincode, parcel.weightGrams, parcel.lengthCm, parcel.breadthCm, parcel.heightCm, mode, paymentType, codAmount]);

  const volumetricGrams = useMemo(() => {
    const { lengthCm: l, breadthCm: b, heightCm: h } = parcel;
    return Math.round(((Number(l) || 0) * (Number(b) || 0) * (Number(h) || 0)) / 5);
  }, [parcel.lengthCm, parcel.breadthCm, parcel.heightCm]);

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!consignee.name.trim()) e.name = "Name is required";
    if (!/^\d{10}$/.test(consignee.mobile.trim())) e.mobile = "Must be exactly 10 digits, no +91 or spaces";
    if (!consignee.address.trim()) e.address = "Address is required";
    if (!/^\d{6}$/.test(consignee.pincode.trim())) e.pincode = "Must be 6 digits";
    if (!consignee.city.trim()) e.city = "City is required";
    if (!(Number(parcel.weightGrams) > 0)) e.weightGrams = "Weight is required";
    if (paymentType === "COD" && !(Number(codAmount) > 0)) e.codAmount = "Enter the amount the courier should collect";
    return e;
  }, [consignee, parcel.weightGrams, paymentType, codAmount]);

  const hasErrors = Object.keys(errors).length > 0;
  const bookingDisabled = Boolean(meta && !meta.bookingEnabled);
  const ready = !hasErrors && Boolean(selectedCourier) && !bookingDisabled;

  function markTouched(field: string) {
    setTouched((t) => ({ ...t, [field]: true }));
  }
  function showErr(field: string) {
    return touched[field] && errors[field];
  }

  async function handleGetRates() {
    if (!/^\d{6}$/.test(consignee.pincode.trim())) {
      markTouched("pincode");
      showToast("Enter a valid 6-digit pincode first");
      return;
    }
    setRatesLoading(true);
    setRatesError(null);
    try {
      const result = await fetchManualEstimate({
        pincode: consignee.pincode.trim(),
        weightGrams: Number(parcel.weightGrams),
        lengthCm: Number(parcel.lengthCm),
        breadthCm: Number(parcel.breadthCm),
        heightCm: Number(parcel.heightCm),
        declaredValue: Number(parcel.declaredValue),
        mode,
        isCod: paymentType === "COD",
      });
      if (result.error || !result.estimate?.length) {
        setRatesError(result.error || "No couriers available for this destination");
        setRates([]);
      } else {
        setRates(result.estimate);
      }
    } catch (err) {
      setRatesError(err instanceof Error ? err.message : "Couldn't fetch rates");
      setRates([]);
    } finally {
      setRatesLoading(false);
    }
  }

  const cheapestCost = rates && rates.length ? Math.min(...rates.map((r) => Number(r.courier_cost))) : null;

  async function handleBook() {
    if (hasErrors || !selectedCourier) {
      setTouched({ name: true, mobile: true, address: true, pincode: true, city: true, codAmount: true });
      showToast("Check the highlighted fields");
      return;
    }
    setBooking(true);
    try {
      const result = await bookManualOrder({
        tag,
        note: note.trim() || null,
        consignee: { ...consignee, mobile: consignee.mobile.trim(), pincode: consignee.pincode.trim() },
        parcel,
        mode,
        payment: paymentType === "COD" ? { type: "COD", codAmount: Number(codAmount) } : { type: "NONE" },
        courierId: String(selectedCourier.courier_id),
        courierName: selectedCourier.courier_name,
        returnAddressId: returnAddressId || undefined,
        rtoAddressId: rtoAddressId || undefined,
      });
      if (result.error) throw new Error(result.error);
      setBookDone({
        reference: result.reference || reference,
        shipmentId: String(result.shipment_id ?? "—"),
        awb: String(result.awb ?? "—"),
        courierName: result.courier_name || selectedCourier.courier_name,
        codLabel: paymentType === "COD" ? `₹${Number(codAmount).toLocaleString("en-IN")}.00` : "Nothing to collect",
      });
      showToast(`Booked ${result.reference || reference} with ${result.courier_name || selectedCourier.courier_name}`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Booking failed");
    } finally {
      setBooking(false);
    }
  }

  function handleAnother() {
    setBookDone(null);
    setTrackResult(null);
    setConsignee(DEFAULT_CONSIGNEE);
    setParcel(DEFAULT_PARCEL);
    setPaymentType("NONE");
    setCodAmount("");
    setNote("");
    setTouched({});
    clearRates();
    fetchNextManualReference(tag).then(setReference).catch(() => {});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDownloadLabel() {
    if (!bookDone) return;
    try {
      const result = await fetchManualLabel(bookDone.reference);
      const url = result.shipment_label?.[0]?.url;
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        showToast("No label available yet — try again shortly");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Couldn't fetch label");
    }
  }

  async function handleTrack() {
    if (!bookDone) return;
    try {
      const result = await fetchManualTracking(bookDone.reference);
      setTrackResult(result.status || result.error || "No status yet — too early after booking");
    } catch (err) {
      setTrackResult(err instanceof Error ? err.message : "Couldn't fetch tracking");
    }
  }

  const tags = meta?.tags || [
    { tag: "INF" as const, label: "Influencer" },
    { tag: "FAM" as const, label: "Family" },
    { tag: "COMP" as const, label: "Complimentary" },
    { tag: "CUST" as const, label: "Customer" },
  ];
  const currentLabel = tags.find((t) => t.tag === tag)?.label || tag;

  return (
    <>
      <Sidebar />
      <div className="main">
        <div className={styles.page}>
          <div className={styles.head}>
            <div>
              <h1>Manual Order</h1>
              <p className={styles.sub}>
                Book a shipment that didn&apos;t come through Shopify — influencer parcels, family orders, complimentary sends, or a counter sale.
              </p>
            </div>
            <span className={styles.pill}>Not from Shopify</span>
          </div>

          {metaError && (
            <div className="state-msg" style={{ background: "var(--red-bg)", color: "var(--red)", borderRadius: 12, marginTop: 16 }}>
              Couldn&apos;t load manual-order settings from the API server ({metaError}).
            </div>
          )}
          {meta?.mock && (
            <div className="notice-box" style={{ marginTop: 16 }}>
              Mock mode — booking here creates a fake shipment, nothing real is sent to iCarry.
            </div>
          )}
          {!meta?.mock && bookingDisabled && (
            <div className="notice-box" style={{ marginTop: 16 }}>
              Real booking isn&apos;t configured — set <code>ICARRY_PICKUP_ADDRESS_ID</code> in the backend first.
            </div>
          )}

          {bookDone && (
            <div className={styles.done}>
              <h3>Shipment booked</h3>
              <div className={styles.dl}><span>Reference</span><span className={styles.v}>{bookDone.reference}</span></div>
              <div className={styles.dl}><span>iCarry shipment ID</span><span className={styles.v}>{bookDone.shipmentId}</span></div>
              <div className={styles.dl}><span>AWB</span><span className={styles.v}>{bookDone.awb}</span></div>
              <div className={styles.dl}><span>Courier</span><span className={styles.v}>{bookDone.courierName}</span></div>
              <div className={styles.dl}><span>COD to collect</span><span className={styles.v}>{bookDone.codLabel}</span></div>
              {trackResult && <div className={styles.dl}><span>Current status</span><span className={styles.v}>{trackResult}</span></div>}
              <div className={styles.doneActs}>
                <button className={styles.doneSolid} type="button" onClick={handleDownloadLabel}>Download label</button>
                <button type="button" onClick={handleTrack}>Track shipment</button>
                <button type="button" onClick={handleAnother}>Book another</button>
              </div>
            </div>
          )}

          <div className={styles.grid}>
            <div>
              {/* 1 — who */}
              <div className={styles.card}>
                <div className={styles.cardH}><span className={styles.n}>1</span><h3>Who is this for?</h3><span className={styles.hint}>Sets the reference prefix</span></div>
                <div className={styles.cardB}>
                  <div className={styles.tags}>
                    {tags.map((t) => (
                      <div
                        key={t.tag}
                        className={`${styles.tag} ${tag === t.tag ? styles.tagOn : ""}`}
                        onClick={() => setTag(t.tag)}
                      >
                        <span className={styles.t}>{t.label}</span>
                        <span className={styles.p}>{t.tag}-</span>
                      </div>
                    ))}
                  </div>
                  <div className={`${styles.row} ${styles.c2}`} style={{ marginTop: 16 }}>
                    <div className={styles.f}>
                      <label>Order reference<span className={styles.req}>*</span></label>
                      <input className={styles.fig} value={reference} readOnly />
                      <p className={styles.note}>Sent to iCarry as client_order_id. Stored against this shipment permanently.</p>
                    </div>
                    <div className={styles.f}>
                      <label>Internal note<span className={styles.opt}>optional</span></label>
                      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Reels collab — Oct batch" />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2 — pickup/return */}
              <div className={styles.card}>
                <div className={styles.cardH}><span className={styles.n}>2</span><h3>Pickup &amp; return</h3><span className={styles.hint}>Leave blank to use pickup for both</span></div>
                <div className={styles.cardB}>
                  <div className={styles.row}>
                    <div className={styles.f}>
                      <label>Pickup address<span className={styles.req}>*</span></label>
                      <input
                        readOnly
                        value={
                          meta?.pickupAddressId
                            ? `Address #${meta.pickupAddressId}${meta.originPincode ? ` — pincode ${meta.originPincode}` : ""}`
                            : "Not configured — set ICARRY_PICKUP_ADDRESS_ID"
                        }
                      />
                    </div>
                  </div>
                  <div className={`${styles.row} ${styles.c2}`}>
                    <div className={styles.f}>
                      <label>Shipper address ID on label<span className={styles.opt}>optional</span></label>
                      <input value={returnAddressId} onChange={(e) => setReturnAddressId(e.target.value)} placeholder="Same as pickup address" />
                      <p className={styles.note}>API field: return_address_id</p>
                    </div>
                    <div className={styles.f}>
                      <label>RTO / return address ID<span className={styles.opt}>optional</span></label>
                      <input value={rtoAddressId} onChange={(e) => setRtoAddressId(e.target.value)} placeholder="Same as pickup address" />
                      <p className={styles.note}>API field: rto_address_id</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3 — consignee */}
              <div className={styles.card}>
                <div className={styles.cardH}><span className={styles.n}>3</span><h3>Who&apos;s receiving it</h3></div>
                <div className={styles.cardB}>
                  <div className={`${styles.row} ${styles.c2}`}>
                    <div className={styles.f}>
                      <label>Full name<span className={styles.req}>*</span></label>
                      <input
                        className={showErr("name") ? "bad" : ""}
                        value={consignee.name}
                        onChange={(e) => setConsignee({ ...consignee, name: e.target.value })}
                        onBlur={() => markTouched("name")}
                        placeholder="Rahul Kumar"
                      />
                      {showErr("name") && <p className={`${styles.err} ${styles.errShow}`}>{errors.name}</p>}
                    </div>
                    <div className={styles.f}>
                      <label>Mobile<span className={styles.req}>*</span></label>
                      <input
                        className={`${styles.fig} ${showErr("mobile") ? "bad" : ""}`}
                        inputMode="numeric"
                        maxLength={10}
                        value={consignee.mobile}
                        onChange={(e) => setConsignee({ ...consignee, mobile: e.target.value.replace(/\D/g, "") })}
                        onBlur={() => markTouched("mobile")}
                        placeholder="9876543210"
                      />
                      {showErr("mobile") && <p className={`${styles.err} ${styles.errShow}`}>{errors.mobile}</p>}
                    </div>
                  </div>
                  <div className={`${styles.row} ${styles.c2}`}>
                    <div className={styles.f}>
                      <label>Alternate mobile<span className={styles.opt}>optional</span></label>
                      <input
                        className={styles.fig}
                        inputMode="numeric"
                        maxLength={10}
                        value={consignee.altMobile}
                        onChange={(e) => setConsignee({ ...consignee, altMobile: e.target.value.replace(/\D/g, "") })}
                        placeholder="8888888888"
                      />
                    </div>
                    <div className={styles.f}>
                      <label>Email<span className={styles.opt}>optional</span></label>
                      <input type="email" value={consignee.email} onChange={(e) => setConsignee({ ...consignee, email: e.target.value })} placeholder="rahul@example.com" />
                    </div>
                  </div>
                  <div className={styles.row}>
                    <div className={styles.f}>
                      <label>Full address<span className={styles.req}>*</span></label>
                      <textarea
                        className={showErr("address") ? "bad" : ""}
                        value={consignee.address}
                        onChange={(e) => setConsignee({ ...consignee, address: e.target.value })}
                        onBlur={() => markTouched("address")}
                        placeholder="24 MG Road, near XYZ Mall, Indiranagar"
                      />
                      <p className={styles.note}>iCarry has no separate landmark field — include locality and landmark here.</p>
                      {showErr("address") && <p className={`${styles.err} ${styles.errShow}`}>{errors.address}</p>}
                    </div>
                  </div>
                  <div className={`${styles.row} ${styles.c3}`}>
                    <div className={styles.f}>
                      <label>Pincode<span className={styles.req}>*</span></label>
                      <input
                        className={`${styles.fig} ${showErr("pincode") ? "bad" : ""}`}
                        inputMode="numeric"
                        maxLength={6}
                        value={consignee.pincode}
                        onChange={(e) => setConsignee({ ...consignee, pincode: e.target.value.replace(/\D/g, "") })}
                        onBlur={() => markTouched("pincode")}
                        placeholder="560001"
                      />
                      {showErr("pincode") && <p className={`${styles.err} ${styles.errShow}`}>{errors.pincode}</p>}
                    </div>
                    <div className={styles.f}>
                      <label>City<span className={styles.req}>*</span></label>
                      <input
                        className={showErr("city") ? "bad" : ""}
                        value={consignee.city}
                        onChange={(e) => setConsignee({ ...consignee, city: e.target.value })}
                        onBlur={() => markTouched("city")}
                        placeholder="Bengaluru"
                      />
                      {showErr("city") && <p className={`${styles.err} ${styles.errShow}`}>{errors.city}</p>}
                    </div>
                    <div className={styles.f}>
                      <label>State<span className={styles.req}>*</span></label>
                      <select value={consignee.state} onChange={(e) => setConsignee({ ...consignee, state: e.target.value })}>
                        {STATES.map(([code, name]) => (
                          <option key={code} value={code}>{name} ({code})</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 — parcel */}
              <div className={styles.card}>
                <div className={styles.cardH}><span className={styles.n}>4</span><h3>What&apos;s in the parcel</h3><span className={styles.hint}>gm and cm only</span></div>
                <div className={styles.cardB}>
                  <div className={styles.row}>
                    <div className={styles.f}>
                      <label>Contents<span className={styles.req}>*</span></label>
                      <input maxLength={255} value={parcel.contents} onChange={(e) => setParcel({ ...parcel, contents: e.target.value })} />
                      <p className={styles.note}>Printed on the label. Max 255 characters.</p>
                    </div>
                  </div>
                  <div className={`${styles.row} ${styles.c2}`}>
                    <div className={styles.f}>
                      <label>Weight (grams)<span className={styles.req}>*</span></label>
                      <input
                        className={`${styles.fig} ${showErr("weightGrams") ? "bad" : ""}`}
                        inputMode="numeric"
                        value={parcel.weightGrams}
                        onChange={(e) => setParcel({ ...parcel, weightGrams: Number(e.target.value) || 0 })}
                        onBlur={() => markTouched("weightGrams")}
                      />
                      {showErr("weightGrams") && <p className={`${styles.err} ${styles.errShow}`}>{errors.weightGrams}</p>}
                    </div>
                    <div className={styles.f}>
                      <label>Declared value ₹<span className={styles.req}>*</span></label>
                      <input
                        className={styles.fig}
                        inputMode="numeric"
                        value={parcel.declaredValue}
                        onChange={(e) => setParcel({ ...parcel, declaredValue: Number(e.target.value) || 0 })}
                      />
                      <p className={styles.note}>Insurance / customs value. Not what&apos;s collected.</p>
                    </div>
                  </div>
                  <div className={`${styles.row} ${styles.c3}`}>
                    <div className={styles.f}>
                      <label>Length (cm)<span className={styles.req}>*</span></label>
                      <input className={styles.fig} inputMode="numeric" value={parcel.lengthCm} onChange={(e) => setParcel({ ...parcel, lengthCm: Number(e.target.value) || 0 })} />
                    </div>
                    <div className={styles.f}>
                      <label>Breadth (cm)<span className={styles.req}>*</span></label>
                      <input className={styles.fig} inputMode="numeric" value={parcel.breadthCm} onChange={(e) => setParcel({ ...parcel, breadthCm: Number(e.target.value) || 0 })} />
                    </div>
                    <div className={styles.f}>
                      <label>Height (cm)<span className={styles.req}>*</span></label>
                      <input className={styles.fig} inputMode="numeric" value={parcel.heightCm} onChange={(e) => setParcel({ ...parcel, heightCm: Number(e.target.value) || 0 })} />
                    </div>
                  </div>
                  <div className={styles.vol}>
                    <span>Volumetric weight</span>
                    <span style={{ textAlign: "right" }}>
                      <span className={`${styles.v} ${styles.fig}`}>{volumetricGrams.toLocaleString("en-IN")} g</span>{" "}
                      <span className={styles.billed}>
                        {volumetricGrams > Number(parcel.weightGrams) ? "billed on volumetric — higher" : "billed on actual weight"}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {/* 5 — mode/payment */}
              <div className={styles.card}>
                <div className={styles.cardH}><span className={styles.n}>5</span><h3>How it ships, and what&apos;s collected</h3></div>
                <div className={styles.cardB}>
                  <div className={`${styles.row} ${styles.c2}`}>
                    <div className={styles.f}>
                      <label>Mode</label>
                      <div className={styles.seg}>
                        {(["S", "A", "H"] as ManualShipMode[]).map((m) => (
                          <button key={m} type="button" className={mode === m ? styles.segOn : ""} onClick={() => setMode(m)}>
                            {m === "S" ? "Surface" : m === "A" ? "Air" : "Hyperlocal"}
                          </button>
                        ))}
                      </div>
                      <p className={styles.note}>{MODE_NOTE[mode]}</p>
                    </div>
                    <div className={styles.f}>
                      <label>Payment</label>
                      <div className={styles.seg}>
                        <button type="button" className={paymentType === "NONE" ? styles.segOn : ""} onClick={() => setPaymentType("NONE")}>Nothing to collect</button>
                        <button type="button" className={paymentType === "COD" ? styles.segOn : ""} onClick={() => setPaymentType("COD")}>Cash on delivery</button>
                      </div>
                      <p className={styles.note}>Manual orders are either COD or free. No prepaid or partial.</p>
                    </div>
                  </div>

                  {paymentType === "COD" && (
                    <div className={`${styles.codBlock} ${styles.show}`}>
                      <div className={styles.f}>
                        <label>Amount to collect from customer ₹<span className={styles.req}>*</span></label>
                        <input
                          className={`${styles.fig} ${showErr("codAmount") ? "bad" : ""}`}
                          inputMode="numeric"
                          value={codAmount}
                          onChange={(e) => setCodAmount(e.target.value.replace(/\D/g, ""))}
                          onBlur={() => markTouched("codAmount")}
                          placeholder="999"
                        />
                        <p className={styles.note} style={{ color: "#6b4fc9" }}>
                          This becomes parcel[value] for COD. Its remittance will be tracked against this order automatically once delivered.
                        </p>
                        {showErr("codAmount") && <p className={`${styles.err} ${styles.errShow}`}>{errors.codAmount}</p>}
                      </div>
                    </div>
                  )}
                  {paymentType !== "COD" && (
                    <div className={`${styles.noPay} ${styles.show}`}>
                      No money is collected on this shipment, so nothing enters settlement tracking or your cash-flow forecast.
                    </div>
                  )}
                </div>
              </div>

              {/* 6 — courier */}
              <div className={styles.card}>
                <div className={styles.cardH}><span className={styles.n}>6</span><h3>Pick a courier</h3><span className={styles.hint}>Live rates for this route</span></div>
                <div className={styles.cardB}>
                  {!rates && (
                    <button className={styles.rateBtn} type="button" onClick={handleGetRates} disabled={ratesLoading}>
                      {ratesLoading ? "Checking couriers…" : "Get live rates for this destination"}
                    </button>
                  )}
                  {ratesError && rates?.length === 0 && (
                    <p className={styles.note} style={{ color: "var(--red)" }}>{ratesError}</p>
                  )}
                  {rates && rates.length > 0 && (
                    <div className={`${styles.couriers} ${styles.show}`}>
                      {rates.map((c) => {
                        const cost = Number(c.courier_cost);
                        const isBest = cheapestCost !== null && cost === cheapestCost;
                        const isOn = selectedCourier?.courier_id === c.courier_id;
                        return (
                          <div key={c.courier_id} className={`${styles.cr} ${isOn ? styles.crOn : ""}`} onClick={() => setSelectedCourier(c)}>
                            <div>
                              <div className={styles.cn}>
                                {c.courier_name}
                                {isBest && <span className={`${styles.badge} ${styles.badgeBest}`}>Lowest cost</span>}
                              </div>
                              <div className={styles.cm}>{c.courier_group_name}</div>
                            </div>
                            <div>
                              <div className={styles.cp}>₹{cost.toFixed(2)}</div>
                            </div>
                          </div>
                        );
                      })}
                      <button className={styles.rateBtn} type="button" onClick={handleGetRates} style={{ marginTop: 4 }}>
                        Re-check rates
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* rail */}
            <aside className={styles.rail}>
              <div className={styles.sum}>
                <div className={styles.sumH}>Shipment summary</div>
                <div className={styles.sumB}>
                  <div className={styles.sl}><span className={styles.k}>Reference</span><span className={`${styles.v} ${styles.fig}`}>{reference}</span></div>
                  <div className={styles.sl}><span className={styles.k}>Type</span><span className={styles.v}>{currentLabel}</span></div>
                  <div className={styles.sl}>
                    <span className={styles.k}>To</span>
                    <span className={`${styles.v} ${consignee.name.trim() ? "" : styles.vEmpty}`}>{consignee.name.trim() || "Not entered"}</span>
                  </div>
                  <div className={styles.sl}>
                    <span className={styles.k}>Destination</span>
                    <span className={`${styles.v} ${consignee.city.trim() || consignee.pincode.trim() ? "" : styles.vEmpty}`}>
                      {[consignee.city.trim(), consignee.pincode.trim()].filter(Boolean).join(" ") || "Not entered"}
                    </span>
                  </div>
                  <div className={styles.sl}><span className={styles.k}>Weight</span><span className={`${styles.v} ${styles.fig}`}>{parcel.weightGrams} g</span></div>
                  <div className={styles.sl}><span className={styles.k}>Mode</span><span className={styles.v}>{mode === "S" ? "Surface" : mode === "A" ? "Air" : "Hyperlocal"}</span></div>
                  <div className={styles.sl}>
                    <span className={styles.k}>Collect on delivery</span>
                    <span className={`${styles.v} ${paymentType === "COD" && Number(codAmount) > 0 ? styles.fig : styles.vEmpty}`}>
                      {paymentType === "COD" && Number(codAmount) > 0 ? `₹${Number(codAmount).toLocaleString("en-IN")}.00` : "Nothing"}
                    </span>
                  </div>
                  <div className={styles.sl}>
                    <span className={styles.k}>Courier</span>
                    <span className={`${styles.v} ${selectedCourier ? "" : styles.vEmpty}`}>{selectedCourier?.courier_name || "Not selected"}</span>
                  </div>
                  <div className={styles.sl}>
                    <span className={styles.k}>Shipping cost</span>
                    <span className={`${styles.v} ${styles.fig} ${selectedCourier ? "" : styles.vEmpty}`}>
                      {selectedCourier ? `₹${Number(selectedCourier.courier_cost).toFixed(2)}` : "—"}
                    </span>
                  </div>
                </div>
                <div className={styles.sumF}>
                  <button className={styles.book} disabled={!ready || booking} onClick={handleBook}>
                    {booking ? "Booking…" : "Book shipment"}
                  </button>
                  <p className={styles.bookNote}>
                    {bookingDisabled
                      ? "Real booking isn't configured on the backend yet."
                      : ready
                      ? `Books with iCarry and saves ${reference} to your dashboard.`
                      : selectedCourier
                      ? "Complete the required fields."
                      : "Complete the required fields and pick a courier."}
                  </p>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>

      <div className={`${styles.toast} ${toast ? styles.toastShow : ""}`}>{toast}</div>
    </>
  );
}
