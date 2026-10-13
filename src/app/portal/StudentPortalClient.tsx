"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { CalendarCheck, CalendarDays, CheckCircle2, CircleAlert, CreditCard, Moon, Sun, Upload, UtensilsCrossed } from "lucide-react";
import SignOutButton from "../SignOutButton";

interface PortalData {
  profile: { studentId: string; fullName: string; email?: string; phone?: string };
  serviceDate: string;
  timezone: string;
  planPricesPaise: { afternoon: number; night: number; both: number };
  nextSubscriptionStartDate: string;
  subscription: null | {
    id: string;
    plan: "afternoon" | "night" | "both";
    status: "active";
    startDate: string;
    endDate: string;
    monthlyAmountPaise: number;
    chargePaise: number;
    paidPaise: number;
    outstandingPaise: number;
    afternoonEligible: boolean;
    nightEligible: boolean;
  };
  subscriptions: Array<{
    id: string;
    plan: string;
    status: string;
    startDate: string;
    endDate: string;
    monthlyAmountPaise: number;
  }>;
  payments: Array<{
    id: string;
    receiptRef: string;
    amountPaise: number;
    method: string;
    receivedAt: string;
    status: string;
  }>;
  attendance: Array<{
    id: string;
    serviceDate: string;
    meal: "afternoon" | "night";
    status: "present" | "absent" | "on_leave" | "not_marked";
    markedAt: string;
  }>;
  menu: null | { afternoonItems: string[]; nightItems: string[] };
  holiday: null | { reason: string; attendanceExceptionAllowed: boolean };
  eligibility: { afternoon: boolean; night: boolean };
  subscriptionsExpiringSoon: number;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { message: string };
}

interface PaymentProofSummary {
  id: string;
  subscriptionId: string;
  amountPaise: number;
  utr: string;
  method: string;
  status: "pending" | "approving" | "rejecting" | "approved" | "rejected";
  submittedAt: string;
  reviewNote?: string;
}

function formatPaise(amount: number): string {
  return `₹${(amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toPaise(rupees: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(rupees)) return null;
  const paise = Math.round(Number(rupees) * 100);
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

function displayDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function StudentPortalClient() {
  const [data, setData] = useState<PortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attendanceSaving, setAttendanceSaving] = useState<"afternoon" | "night" | null>(null);
  const [attendanceMessage, setAttendanceMessage] = useState("");
  const [attendanceError, setAttendanceError] = useState("");
  const [subscriptionPlan, setSubscriptionPlan] = useState<"afternoon" | "night" | "both">("afternoon");
  const [subscriptionMonths, setSubscriptionMonths] = useState(1);
  const [subscriptionStartDate, setSubscriptionStartDate] = useState("");
  const [subscriptionSaving, setSubscriptionSaving] = useState(false);
  const [subscriptionMessage, setSubscriptionMessage] = useState("");
  const [subscriptionError, setSubscriptionError] = useState("");
  const [paymentProofs, setPaymentProofs] = useState<PaymentProofSummary[]>([]);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [utr, setUtr] = useState("");
  const [upiId, setUpiId] = useState("");
  const [paymentQrUrl, setPaymentQrUrl] = useState("");
  const [upiCopyMessage, setUpiCopyMessage] = useState("");
  const [upiCopyError, setUpiCopyError] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [screenshotInputKey, setScreenshotInputKey] = useState(0);
  const [proofSaving, setProofSaving] = useState(false);
  const [proofMessage, setProofMessage] = useState("");
  const [proofError, setProofError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/student/me", { signal: controller.signal }),
      fetch("/api/student/payment-proofs", { signal: controller.signal }),
    ])
      .then(async ([portalResponse, proofResponse]) => {
        const [portalResult, proofResult] = await Promise.all([
          portalResponse.json() as Promise<ApiEnvelope<PortalData>>,
          proofResponse.json() as Promise<ApiEnvelope<{ proofs: PaymentProofSummary[]; paymentSettings: { upiId: string; qrUrl: string } }>>,
        ]);
        if (!portalResponse.ok || !portalResult.ok || !portalResult.data) {
          throw new Error(portalResult.error?.message ?? "Could not load your portal");
        }
        if (!proofResponse.ok || !proofResult.ok || !proofResult.data) {
          throw new Error(proofResult.error?.message ?? "Could not load payment proof history");
        }
        setData(portalResult.data);
        setSubscriptionStartDate(portalResult.data.nextSubscriptionStartDate);
        setPaymentProofs(proofResult.data.proofs);
        setUpiId(proofResult.data.paymentSettings.upiId);
        setPaymentQrUrl(proofResult.data.paymentSettings.qrUrl);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name !== "AbortError") setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let active = true;
    async function refreshPaymentSettings() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/student/payment-proofs", { cache: "no-store" });
        const result = await response.json() as ApiEnvelope<{ paymentSettings: { upiId: string; qrUrl: string } }>;
        if (active && response.ok && result.ok && result.data) {
          setUpiId(result.data.paymentSettings.upiId);
          setPaymentQrUrl(result.data.paymentSettings.qrUrl);
        }
      } catch {
        // Keep the last successfully loaded payment settings if a refresh fails.
      }
    }
    window.addEventListener("focus", refreshPaymentSettings);
    document.addEventListener("visibilitychange", refreshPaymentSettings);
    return () => {
      active = false;
      window.removeEventListener("focus", refreshPaymentSettings);
      document.removeEventListener("visibilitychange", refreshPaymentSettings);
    };
  }, []);

  async function markMealAttendance(meal: "afternoon" | "night", status: "present" | "absent") {
    setAttendanceSaving(meal);
    setAttendanceError("");
    setAttendanceMessage("");
    try {
      const response = await fetch("/api/student/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meal, status }),
      });
      const result = (await response.json()) as ApiEnvelope<{
        attendance: PortalData["attendance"][number];
      }>;
      if (!response.ok || !result.ok || !result.data) {
        throw new Error(result.error?.message ?? "Could not mark attendance");
      }

      const newRecord = result.data.attendance;
      setData((current) => current ? {
        ...current,
        attendance: [
          newRecord,
          ...current.attendance.filter(
            (record) => !(record.serviceDate.slice(0, 10) === newRecord.serviceDate && record.meal === meal),
          ),
        ],
      } : current);
      setAttendanceMessage(`${meal === "afternoon" ? "Afternoon" : "Night"} marked ${status}. The admin attendance view will update shortly.`);
    } catch (markError: unknown) {
      setAttendanceError(markError instanceof Error ? markError.message : "Could not mark attendance");
    } finally {
      setAttendanceSaving(null);
    }
  }

  async function enrollInSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubscriptionError("");
    setSubscriptionMessage("");
    setSubscriptionSaving(true);
    let enrollmentCreated = false;
    try {
      const response = await fetch("/api/student/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: subscriptionPlan,
          months: subscriptionMonths,
          startDate: subscriptionStartDate,
        }),
      });
      const result = (await response.json()) as ApiEnvelope<{
        subscription: { endDate: string };
      }>;
      if (!response.ok || !result.ok || !result.data) {
        throw new Error(result.error?.message ?? "Could not create subscription");
      }

      enrollmentCreated = true;
      setSubscriptionMessage("Subscription created. The final charge is calculated from the calendar months covered.");
      setSubscriptionStartDate(result.data.subscription.endDate.slice(0, 10));
      try {
        const portalResponse = await fetch("/api/student/me");
        const portalResult = (await portalResponse.json()) as ApiEnvelope<PortalData>;
        if (portalResponse.ok && portalResult.ok && portalResult.data) setData(portalResult.data);
      } catch {
        setSubscriptionMessage("Subscription created. Reload the portal to refresh your balance and schedule.");
      }
    } catch (enrollError: unknown) {
      if (!enrollmentCreated) {
        setSubscriptionError(enrollError instanceof Error ? enrollError.message : "Could not create subscription");
      }
    } finally {
      setSubscriptionSaving(false);
    }
  }

  async function submitPaymentProof(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProofMessage("");
    setProofError("");
    const amountPaise = toPaise(paymentAmount);
    if (!data?.subscription || !amountPaise || amountPaise > data.subscription.outstandingPaise) {
      setProofError("Enter a valid amount no greater than your outstanding balance.");
      return;
    }
    if (!screenshot) {
      setProofError("Choose a screenshot of your payment to submit.");
      return;
    }

    setProofSaving(true);
    try {
      const formData = new FormData();
      formData.set("subscriptionId", data.subscription.id);
      formData.set("amountPaise", String(amountPaise));
      formData.set("method", "upi");
      formData.set("utr", utr);
      formData.set("screenshot", screenshot);
      const response = await fetch("/api/student/payment-proofs", {
        method: "POST",
        body: formData,
      });
      const result = (await response.json()) as ApiEnvelope<{ proof: PaymentProofSummary }>;
      if (!response.ok || !result.ok || !result.data) {
        throw new Error(result.error?.message ?? "Could not submit payment proof");
      }
      setPaymentProofs((current) => [result.data!.proof, ...current]);
      setPaymentAmount("");
      setUtr("");
      setScreenshot(null);
      setScreenshotInputKey((current) => current + 1);
      setProofMessage("Payment submitted for verification. It will count as paid only after admin approval.");
    } catch (submitError: unknown) {
      setProofError(submitError instanceof Error ? submitError.message : "Could not submit payment proof");
    } finally {
      setProofSaving(false);
    }
  }

  function copyConfiguredUpiId() {
    setUpiCopyMessage("");
    setUpiCopyError("");
    if (!upiId || !navigator.clipboard?.writeText) {
      setUpiCopyError("Clipboard access is unavailable. Please copy the UPI ID manually.");
      return;
    }
    void navigator.clipboard.writeText(upiId).then(
      () => setUpiCopyMessage("UPI ID copied."),
      () => setUpiCopyError("Could not copy UPI ID. Please copy it manually."),
    );
  }

  if (loading) {
    return <main className="min-h-screen bg-[#f3f6f3] p-5" role="status"><div className="mx-auto h-48 max-w-5xl animate-pulse rounded-xl bg-white" /></main>;
  }

  if (error || !data) {
    return <main className="mx-auto flex min-h-screen max-w-xl items-center gap-3 px-5 text-sm text-rose-900" role="alert"><CircleAlert aria-hidden="true" size={19} />{error || "Portal data is unavailable"}</main>;
  }

  const afternoonMenu = data.menu?.afternoonItems ?? [];
  const nightMenu = data.menu?.nightItems ?? [];

  return (
    <main className="min-h-screen bg-[#f3f6f3] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-[76px] max-w-6xl items-center justify-between gap-4 px-4 sm:px-8">
          <div><p className="text-xs font-semibold text-emerald-800">ABHISHEK MESS / STUDENT</p><h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Your portal</h1></div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
        <section className="border-y border-emerald-900/10 bg-[#0d4b3d] px-5 py-6 text-white sm:rounded-xl sm:border sm:px-7">
          <p className="text-xs font-semibold text-emerald-200">{data.profile.studentId}</p>
          <h2 className="mt-2 text-2xl font-bold">Hello, {data.profile.fullName}</h2>
          <p className="mt-2 text-sm text-emerald-50/75">{data.profile.email ?? data.profile.phone ?? "Contact details not on file"}</p>
        </section>

        {data.holiday && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status"><strong>Mess holiday:</strong> {data.holiday.reason}</p>}
        {data.subscriptionsExpiringSoon > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="status">Your subscription expires soon. Contact the mess administrator about renewal.</p>}

        <section aria-label="Current meal eligibility" className="grid gap-3 sm:grid-cols-2">
          {[{ name: "Afternoon", eligible: data.eligibility.afternoon, icon: Sun }, { name: "Night", eligible: data.eligibility.night, icon: Moon }].map(({ name, eligible, icon: Icon }) => (
            <article className="flex items-center justify-between border-y border-slate-200 bg-white px-4 py-4 sm:rounded-xl sm:border sm:px-5" key={name}>
              <div className="flex items-center gap-3"><Icon aria-hidden="true" className="text-emerald-800" size={20} /><div><p className="text-sm font-bold">{name} meal</p><p className="mt-1 text-xs text-slate-500">{eligible ? "Subscription eligible" : "Not included in current plan"}</p></div></div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${eligible ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{eligible ? "Eligible" : "Not eligible"}</span>
            </article>
          ))}
        </section>

        <section className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-5" aria-label="Mark today's attendance">
          <div className="px-4 sm:px-0">
            <h2 className="font-bold">Today&apos;s attendance</h2>
            <p className="mt-1 text-sm text-slate-500">Mark each eligible meal once during its attendance window.</p>
          </div>
          {data.holiday && <p className="mx-4 mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:mx-0">Attendance is closed for today&apos;s mess holiday. Contact the admin if a correction is needed.</p>}
          {attendanceMessage && <p className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 sm:mx-0" role="status"><CheckCircle2 aria-hidden="true" size={16} />{attendanceMessage}</p>}
          {attendanceError && <p className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 sm:mx-0" role="alert"><CircleAlert aria-hidden="true" size={16} />{attendanceError}</p>}
          <div className="mt-4 divide-y divide-slate-100 border-t border-slate-100">
            {([
              { meal: "afternoon", name: "Afternoon", eligible: data.eligibility.afternoon, icon: Sun },
              { meal: "night", name: "Night", eligible: data.eligibility.night, icon: Moon },
            ] as const).map(({ meal, name, eligible, icon: Icon }) => {
              const record = data.attendance.find(
                (item) => item.serviceDate.slice(0, 10) === data.serviceDate && item.meal === meal,
              );
              return (
                <article className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-0" key={meal}>
                  <div className="flex items-center gap-3">
                    <Icon aria-hidden="true" className="text-emerald-800" size={19} />
                    <div>
                      <h3 className="text-sm font-semibold">{name} meal</h3>
                      <p className="mt-1 text-xs text-slate-500">
                        {!eligible ? "Not eligible on your current subscription" : record ? `Marked ${record.status.replaceAll("_", " ")}` : "No mark yet"}
                      </p>
                    </div>
                  </div>
                  {record ? (
                    <span className={`w-fit rounded-full px-3 py-1.5 text-xs font-bold capitalize ${record.status === "present" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{record.status.replaceAll("_", " ")}</span>
                  ) : eligible ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button className="min-h-10 rounded-lg bg-emerald-800 px-3 text-sm font-bold text-white hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60" disabled={attendanceSaving !== null || Boolean(data.holiday)} onClick={() => void markMealAttendance(meal, "present")} type="button">{attendanceSaving === meal ? "Saving…" : "Mark Present"}</button>
                      <button className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60" disabled={attendanceSaving !== null || Boolean(data.holiday)} onClick={() => void markMealAttendance(meal, "absent")} type="button">{attendanceSaving === meal ? "Saving…" : "Mark Absent"}</button>
                    </div>
                  ) : (
                    <span className="w-fit rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">Not eligible</span>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {data.subscription ? (
          <section className="border-y border-slate-200 bg-white px-4 py-5 sm:rounded-xl sm:border sm:px-6">
            <h2 className="font-bold">Current subscription</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <div><p className="text-xs text-slate-500">Plan</p><p className="mt-1 font-semibold capitalize">{data.subscription.plan}</p></div>
              <div><p className="text-xs text-slate-500">Valid period</p><p className="mt-1 text-sm font-semibold">{displayDate(data.subscription.startDate)} – {displayDate(data.subscription.endDate)} <span className="font-normal text-slate-500">(end exclusive)</span></p></div>
              <div><p className="text-xs text-slate-500">Monthly charge</p><p className="mt-1 font-semibold">{formatPaise(data.subscription.monthlyAmountPaise)}</p></div>
              <div><p className="text-xs text-slate-500">Outstanding</p><p className="mt-1 font-semibold">{formatPaise(data.subscription.outstandingPaise)}</p></div>
            </div>
          </section>
        ) : (
          <section className="border-y border-slate-200 bg-white px-4 py-5 sm:rounded-xl sm:border sm:px-6"><h2 className="font-bold">No current subscription</h2><p className="mt-2 text-sm text-slate-500">Contact the mess administrator to discuss enrollment or renewal.</p></section>
        )}

        <section className="border-y border-slate-200 bg-white px-4 py-5 sm:rounded-xl sm:border sm:px-6">
          <h2 className="font-bold">Choose or schedule a subscription</h2>
          <p className="mt-1 text-sm text-slate-500">Prices are set by the mess. The server calculates the charge using the calendar months covered.</p>
          {subscriptionMessage && <p className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900" role="status">{subscriptionMessage}</p>}
          {subscriptionError && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900" role="alert">{subscriptionError}</p>}
          <form className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={enrollInSubscription}>
            <label className="text-sm font-semibold">Meal plan
              <select className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setSubscriptionPlan(event.target.value as typeof subscriptionPlan)} value={subscriptionPlan}><option value="afternoon">Afternoon only · {formatPaise(data.planPricesPaise.afternoon)}/month</option><option value="night">Night only · {formatPaise(data.planPricesPaise.night)}/month</option><option value="both">Both meals · {formatPaise(data.planPricesPaise.both)}/month</option></select>
            </label>
            <label className="text-sm font-semibold">Term
              <select className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(event) => setSubscriptionMonths(Number(event.target.value))} value={subscriptionMonths}>{Array.from({ length: 12 }, (_, index) => index + 1).map((months) => <option key={months} value={months}>{months} {months === 1 ? "month" : "months"}</option>)}</select>
            </label>
            <label className="text-sm font-semibold">Start date
              <input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" min={data.nextSubscriptionStartDate} onChange={(event) => setSubscriptionStartDate(event.target.value)} required type="date" value={subscriptionStartDate} />
            </label>
            <div className="flex items-end"><button className="min-h-11 w-full rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white transition hover:bg-emerald-900 active:scale-[.98] disabled:cursor-wait disabled:opacity-60" disabled={subscriptionSaving || !subscriptionStartDate} type="submit">{subscriptionSaving ? "Creating…" : "Create subscription"}</button></div>
            <p className="text-xs leading-5 text-slate-500 sm:col-span-2 xl:col-span-4">Next available start date: {displayDate(data.nextSubscriptionStartDate)}. Any paid amount remains subject to admin confirmation.</p>
          </form>
        </section>

        <section className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-5">
          <div className="flex items-center gap-2 px-4 sm:px-0"><Upload aria-hidden="true" className="text-emerald-800" size={18} /><h2 className="font-bold">Submit payment proof</h2></div>
          <p className="mt-1 px-4 text-sm text-slate-500 sm:px-0">Pay the actual outstanding amount for your subscription, then return here with the transaction reference.</p>
          {upiId ? <div className="mx-4 mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4 sm:mx-0"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-emerald-800">Owner UPI ID</p><p className="mt-1 break-all text-lg font-bold text-slate-900">{upiId}</p></div><button type="button" onClick={copyConfiguredUpiId} className="min-h-10 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white">Copy UPI ID</button></div>{upiCopyMessage && <p className="mt-2 text-sm font-medium text-emerald-900" role="status">{upiCopyMessage}</p>}{upiCopyError && <p className="mt-2 text-sm font-medium text-rose-800" role="alert">{upiCopyError}</p>}</div> : <p className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 sm:mx-0">UPI payment is not configured yet. Please contact the mess administrator before paying.</p>}
          {paymentQrUrl ? <figure className="mx-4 mt-4 flex flex-col items-center rounded-xl border border-slate-200 bg-white p-4 sm:mx-0 sm:p-6"><Image unoptimized alt="Mess owner's UPI payment QR code" className="h-auto w-full max-w-[280px] rounded-lg object-contain" height={320} src={paymentQrUrl} width={320} /><figcaption className="mt-3 text-center text-sm text-slate-600">Scan this QR code in your UPI app and verify the displayed recipient is the mess owner before paying.</figcaption></figure> : upiId ? <p className="mx-4 mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 sm:mx-0">No QR image is configured. You can still pay using the UPI ID above.</p> : null}
          <p className="mx-4 mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700 sm:mx-0">Open your UPI app, pay the correct amount, note the UTR, and return to submit it. An uploaded screenshot does not confirm payment; the administrator will verify the transaction.</p>
          {data.subscription && data.subscription.outstandingPaise > 0 ? (
            <form className="mt-4 grid gap-4 px-4 sm:grid-cols-2 sm:px-0" onSubmit={submitPaymentProof}>
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm sm:col-span-2">Outstanding balance: <strong>{formatPaise(data.subscription.outstandingPaise)}</strong></p>
              <label className="text-sm font-semibold">Amount paid (INR)
                <input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" inputMode="decimal" max={data.subscription.outstandingPaise / 100} onChange={(event) => setPaymentAmount(event.target.value)} placeholder="e.g. 750.00" required value={paymentAmount} />
              </label>
              <label className="text-sm font-semibold">UTR / transaction reference
                <input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm uppercase" autoComplete="off" minLength={6} maxLength={32} onChange={(event) => setUtr(event.target.value.toUpperCase())} pattern="[A-Za-z0-9]{6,32}" placeholder="Transaction reference" required value={utr} />
              </label>
              <label className="text-sm font-semibold sm:col-span-2">Payment screenshot (PNG, JPEG, or WebP; max 5 MB)
                <input key={screenshotInputKey} accept="image/png,image/jpeg,image/webp" className="mt-2 block min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:font-semibold file:text-emerald-800" onChange={(event) => setScreenshot(event.target.files?.[0] ?? null)} required type="file" />
              </label>
              {proofError && <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900 sm:col-span-2" role="alert">{proofError}</p>}
              {proofMessage && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 sm:col-span-2" role="status">{proofMessage}</p>}
              <button className="min-h-11 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-60 sm:col-span-2" disabled={proofSaving || !upiId} type="submit">{proofSaving ? "Submitting…" : "Submit Payment for Verification"}</button>
            </form>
          ) : <p className="mt-4 px-4 text-sm text-slate-600 sm:px-0">No outstanding balance is available for payment proof.</p>}
          {paymentProofs.length > 0 && <div className="mt-5 border-t border-slate-100 px-4 sm:px-0"><h3 className="py-3 text-sm font-semibold">Payment submissions</h3><ul className="divide-y divide-slate-100">{paymentProofs.map((proof) => <li className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" key={proof.id}><span>{formatPaise(proof.amountPaise)} · UTR {proof.utr} · {displayDate(proof.submittedAt)}</span><span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${proof.status === "approved" ? "bg-emerald-50 text-emerald-800" : proof.status === "rejected" ? "bg-rose-50 text-rose-800" : "bg-amber-50 text-amber-900"}`}>{proof.status === "approved" ? "Paid" : proof.status === "rejected" ? "Rejected" : "Pending Verification"}</span>{proof.reviewNote && <p className="w-full text-xs text-slate-500">{proof.reviewNote}</p>}</li>)}</ul></div>}
        </section>

        <section className="grid gap-5 lg:grid-cols-2">
          <article className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-5">
            <div className="flex items-center gap-2 px-4 sm:px-0"><UtensilsCrossed aria-hidden="true" className="text-emerald-800" size={18} /><h2 className="font-bold">Today&apos;s menu</h2></div>
            {data.holiday ? <p className="mt-4 px-4 text-sm text-slate-600 sm:px-0">Mess service is scheduled as a holiday today.</p> : <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {[{ name: "Afternoon", items: afternoonMenu }, { name: "Night", items: nightMenu }].map(({ name, items }) => <div className="border-t border-slate-100 px-4 pt-3 sm:px-0" key={name}><h3 className="text-sm font-semibold">{name}</h3>{items.length ? <ul className="mt-2 space-y-1 text-sm text-slate-600">{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-slate-500">Menu not published.</p>}</div>)}
            </div>}
          </article>

          <article className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-5">
            <div className="flex items-center gap-2 px-4 sm:px-0"><CalendarCheck aria-hidden="true" className="text-emerald-800" size={18} /><h2 className="font-bold">Attendance history</h2></div>
            {data.attendance.length === 0 ? <p className="mt-4 px-4 text-sm text-slate-500 sm:px-0">No attendance records yet. Not Marked records are not shown as absences.</p> : <ul className="mt-3 divide-y divide-slate-100">{data.attendance.slice(0, 8).map((record) => <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-0" key={record.id}><span>{displayDate(record.serviceDate)} · <span className="capitalize">{record.meal}</span></span><span className="font-semibold capitalize">{record.status.replaceAll("_", " ")}</span></li>)}</ul>}
          </article>
        </section>

        <section className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-5">
          <div className="flex items-center gap-2 px-4 sm:px-0"><CreditCard aria-hidden="true" className="text-emerald-800" size={18} /><h2 className="font-bold">Payment history</h2></div>
          {data.payments.length === 0 ? <p className="mt-4 px-4 text-sm text-slate-500 sm:px-0">No payment records yet.</p> : <div className="mt-3 divide-y divide-slate-100">{data.payments.map((payment) => <article className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-0" key={payment.id}><div><p className="font-semibold">{payment.receiptRef}</p><p className="mt-1 text-xs capitalize text-slate-500">{payment.method.replaceAll("_", " ")} · {payment.status}</p></div><p className="font-bold">{formatPaise(payment.amountPaise)}</p></article>)}</div>}
        </section>

        <section aria-label="Subscription history" className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-5">
          <div className="flex items-center gap-2 px-4 sm:px-0"><CalendarDays aria-hidden="true" className="text-emerald-800" size={18} /><h2 className="font-bold">Subscription history</h2></div>
          {data.subscriptions.length === 0 ? <p className="mt-4 px-4 text-sm text-slate-500 sm:px-0">No subscription history.</p> : <ul className="mt-3 divide-y divide-slate-100">{data.subscriptions.map((subscription) => <li className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm sm:px-0" key={subscription.id}><span className="capitalize">{subscription.plan} · {subscription.status}</span><span>{displayDate(subscription.startDate)} – {displayDate(subscription.endDate)}</span><span className="font-semibold">{formatPaise(subscription.monthlyAmountPaise)}/mo</span></li>)}</ul>}
        </section>
      </div>
    </main>
  );
}
