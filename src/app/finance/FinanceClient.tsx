"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Image from "next/image";
import { CheckCircle2, CircleAlert, CreditCard, ReceiptIndianRupee, RotateCcw, Wallet, XCircle } from "lucide-react";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { message: string };
}

interface PayableSubscription {
  subscription: {
    _id: string;
    plan: "afternoon" | "night" | "both";
    status: "active" | "expired";
    startDate: string;
    endDate: string;
  };
  student: { _id: string; studentId: string; fullName: string; status: string };
  totalChargePaise: number;
  receivedPaise: number;
  outstandingPaise: number;
}

interface ExpenseRecord {
  _id: string;
  category?: string;
  amountPaise: number;
  expenseDate?: string;
  description: string;
  paymentMethod?: string;
  reference?: string;
  status: "recorded" | "reversed";
}

interface FinancialReport {
  period: { from: string; to: string };
  accruedChargesPaise: number;
  collectedPaise: number;
  expensesPaise: number;
  outstandingPaise: number;
  netCashMovementPaise: number;
  netCashMovementLabel: string;
  billingPolicy: string;
  paymentsByMethod: Record<string, number>;
  expensesByCategory: Record<string, number>;
}

interface PaymentProof {
  _id: string;
  student: { studentId: string; fullName: string; email?: string };
  subscription: { _id: string; plan: string };
  amountPaise: number;
  method: string;
  status: "pending" | "approving" | "rejecting" | "approved" | "rejected";
  submittedAt: string;
  reviewNote?: string;
}

const expenseCategories = [
  ["groceries", "Groceries"],
  ["vegetables", "Vegetables"],
  ["milk", "Milk"],
  ["cooking_gas", "Cooking gas"],
  ["staff_wages", "Staff wages"],
  ["electricity", "Electricity"],
  ["water", "Water"],
  ["cleaning", "Cleaning"],
  ["food_supplies", "Food supplies"],
  ["utilities", "Utilities"],
  ["rent", "Rent"],
  ["maintenance", "Maintenance"],
  ["staff", "Staff"],
  ["transport", "Transport"],
  ["other", "Other"],
] as const;

function indiaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

type PeriodPreset = "today" | "week" | "month" | "custom";

function shiftDate(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function presetRange(preset: Exclude<PeriodPreset, "custom">): { from: string; to: string } {
  const today = indiaDate();
  if (preset === "today") return { from: today, to: today };
  if (preset === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  return { from: shiftDate(today, -((weekday + 6) % 7)), to: today };
}

function formatPaise(amount: number): string {
  return `₹${(amount / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toPaise(rupees: string): number | null {
  if (!/^\d+(?:\.\d{1,2})?$/.test(rupees)) return null;
  const paise = Math.round(Number(rupees) * 100);
  return Number.isSafeInteger(paise) && paise > 0 ? paise : null;
}

export default function FinanceClient() {
  const [payables, setPayables] = useState<PayableSubscription[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);
  const [report, setReport] = useState<FinancialReport | null>(null);
  const [paymentProofs, setPaymentProofs] = useState<PaymentProof[]>([]);
  const [selectedSubscription, setSelectedSubscription] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "upi" | "bank_transfer" | "card">("upi");
  const [expenseCategory, setExpenseCategory] = useState<(typeof expenseCategories)[number][0]>("food_supplies");
  const [expenseAmount, setExpenseAmount] = useState("");
  const [expenseDate, setExpenseDate] = useState(indiaDate);
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<"cash" | "upi" | "bank_transfer" | "card">("cash");
  const [expenseReference, setExpenseReference] = useState("");
  const [expenseDescription, setExpenseDescription] = useState("");
  const [fromDate, setFromDate] = useState(indiaDate().slice(0, 8) + "01");
  const [toDate, setToDate] = useState(indiaDate);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("month");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [proofReviewNote, setProofReviewNote] = useState("");
  const [reviewingProof, setReviewingProof] = useState<string | null>(null);
  const [expenseToReverse, setExpenseToReverse] = useState<ExpenseRecord | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversingExpense, setReversingExpense] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const paymentKey = useRef("");
  const expenseKey = useRef("");

  function selectPeriod(preset: Exclude<PeriodPreset, "custom">) {
    const range = presetRange(preset);
    setLoading(true);
    setPeriodPreset(preset);
    setFromDate(range.from);
    setToDate(range.to);
  }

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/finance/subscriptions", { signal: controller.signal }).then((response) => response.json()),
      fetch(`/api/expenses?from=${fromDate}&to=${toDate}`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`/api/reports/financial?from=${fromDate}&to=${toDate}`, { signal: controller.signal }).then((response) => response.json()),
      fetch("/api/payment-proofs", { signal: controller.signal }).then((response) => response.json()),
    ])
      .then(([payableResult, expenseResult, reportResult, proofResult]) => {
        if (!payableResult.ok || !expenseResult.ok || !reportResult.ok || !proofResult.ok) {
          throw new Error("Could not load finance records");
        }
        setPayables(payableResult.data.subscriptions);
        setExpenses(expenseResult.data.expenses);
        setReport(reportResult.data);
        setPaymentProofs(proofResult.data.proofs);
        if (payableResult.data.subscriptions.length > 0) {
          setSelectedSubscription((current) =>
            current || payableResult.data.subscriptions[0].subscription._id,
          );
        }
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name !== "AbortError") setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [fromDate, refreshKey, toDate]);

  useEffect(() => {
    const controller = new AbortController();
    let requestPending = false;

    async function refreshProofs() {
      if (requestPending || controller.signal.aborted) return;
      requestPending = true;
      try {
        const response = await fetch("/api/payment-proofs", { signal: controller.signal });
        const result = (await response.json()) as ApiEnvelope<{ proofs: PaymentProof[] }>;
        if (response.ok && result.ok && result.data) setPaymentProofs(result.data.proofs);
      } catch (refreshError: unknown) {
        if (refreshError instanceof Error && refreshError.name !== "AbortError") setError(refreshError.message);
      } finally {
        requestPending = false;
      }
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshProofs();
    }, 15_000);
    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, []);

  async function recordPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountPaise = toPaise(paymentAmount);
    if (!selectedSubscription || !amountPaise) {
      setError("Enter a positive payment amount with at most two decimal places.");
      return;
    }
    if (!paymentKey.current) paymentKey.current = crypto.randomUUID();

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/subscriptions/${selectedSubscription}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": paymentKey.current },
        body: JSON.stringify({ amountPaise, method: paymentMethod }),
      });
      const result = (await response.json()) as ApiEnvelope<{ payment: { receiptRef: string } }>;
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error?.message ?? "Could not record payment");
      setNotice(`Payment recorded. Receipt ${result.data.payment.receiptRef}.`);
      setPaymentAmount("");
      paymentKey.current = "";
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not record payment");
    } finally {
      setSaving(false);
    }
  }

  async function recordExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const amountPaise = toPaise(expenseAmount);
    if (!amountPaise) {
      setError("Enter a positive expense amount with at most two decimal places.");
      return;
    }
    if (!expenseKey.current) expenseKey.current = crypto.randomUUID();

    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": expenseKey.current },
        body: JSON.stringify({
          category: expenseCategory,
          amountPaise,
          expenseDate,
          description: expenseDescription,
          paymentMethod: expensePaymentMethod,
          reference: expenseReference || undefined,
        }),
      });
      const result = (await response.json()) as ApiEnvelope<{ expense: { _id: string } }>;
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error?.message ?? "Could not record expense");
      setNotice("Expense recorded.");
      setExpenseAmount("");
      setExpenseDescription("");
      setExpenseReference("");
      expenseKey.current = "";
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not record expense");
    } finally {
      setSaving(false);
    }
  }

  async function reverseSelectedExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!expenseToReverse || reversalReason.trim().length < 8) return;
    setReversingExpense(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/expenses/${expenseToReverse._id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reversalReason }),
      });
      const result = (await response.json()) as ApiEnvelope<unknown>;
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "Could not reverse expense");
      setNotice("Expense reversed with an audit reason. Record a corrected expense separately if needed.");
      setExpenseToReverse(null);
      setReversalReason("");
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (reverseError: unknown) {
      setError(reverseError instanceof Error ? reverseError.message : "Could not reverse expense");
    } finally {
      setReversingExpense(false);
    }
  }

  async function reviewPaymentProof(proof: PaymentProof, decision: "paid" | "not_paid") {
    setReviewingProof(proof._id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/payment-proofs/${proof._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decision,
          reviewNote: proofReviewNote || undefined,
        }),
      });
      const result = (await response.json()) as ApiEnvelope<unknown>;
      if (!response.ok || !result.ok) {
        throw new Error(result.error?.message ?? "Could not review payment proof");
      }
      setNotice(decision === "paid" ? "Payment approved and added to collections." : "Payment proof marked not paid.");
      setProofReviewNote("");
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (reviewError: unknown) {
      setError(reviewError instanceof Error ? reviewError.message : "Could not review payment proof");
    } finally {
      setReviewingProof(null);
    }
  }

  const payable = payables.find((item) => item.subscription._id === selectedSubscription);
  const paymentMethodLabels: Record<string, string> = {
    cash: "Cash",
    upi: "UPI",
    bank_transfer: "Bank transfer",
    card: "Card",
  };
  const chartColors: Record<string, string> = {
    cash: "#047857",
    upi: "#2563eb",
    bank_transfer: "#d97706",
    card: "#e11d48",
  };
  const paymentSlices = Object.entries(report?.paymentsByMethod ?? {})
    .filter(([, amount]) => amount > 0)
    .map(([method, amount]) => ({ method, amount, color: chartColors[method] ?? "#64748b" }));
  const paymentTotal = paymentSlices.reduce((total, slice) => total + slice.amount, 0);
  let paymentChartCursor = 0;
  const paymentChartGradient = paymentTotal > 0
    ? `conic-gradient(${paymentSlices.map((slice) => {
      const start = paymentChartCursor;
      paymentChartCursor += (slice.amount / paymentTotal) * 100;
      return `${slice.color} ${start}% ${paymentChartCursor}%`;
    }).join(", ")})`
    : "#e2e8f0";
  const expenseCategoryLabels: Record<string, string> = {
    food_supplies: "Food supplies",
    groceries: "Groceries",
    vegetables: "Vegetables",
    milk: "Milk",
    cooking_gas: "Cooking gas",
    utilities: "Utilities",
    electricity: "Electricity",
    water: "Water",
    rent: "Rent",
    maintenance: "Maintenance",
    staff: "Staff",
    staff_wages: "Staff wages",
    cleaning: "Cleaning",
    transport: "Transport",
    other: "Other",
  };
  const expenseChartColors = ["#087451", "#2563eb", "#d97706", "#e11d48", "#0891b2", "#718078", "#ea580c"];
  const expenseSlices = Object.entries(report?.expensesByCategory ?? {})
    .filter(([, amount]) => amount > 0)
    .map(([category, amount], index) => ({
      category,
      label: expenseCategoryLabels[category] ?? category.replaceAll("_", " "),
      amount,
      color: expenseChartColors[index % expenseChartColors.length],
    }));
  const expenseTotal = expenseSlices.reduce((total, slice) => total + slice.amount, 0);
  let expenseChartCursor = 0;
  const expenseChartGradient = expenseTotal > 0
    ? `conic-gradient(${expenseSlices.map((slice) => {
      const start = expenseChartCursor;
      expenseChartCursor += (slice.amount / expenseTotal) * 100;
      return `${slice.color} ${start}% ${expenseChartCursor}%`;
    }).join(", ")})`
    : "#e2e8f0";

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-slate-900 animate-page-enter">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div><p className="text-xs font-semibold text-emerald-800">ABHISHEK MESS / ADMIN</p><h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Payments &amp; expenses</h1></div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between lg:justify-end">
            <div aria-label="Financial report period" className="grid grid-cols-4 rounded-lg border border-slate-200 bg-slate-50 p-1" role="group">
              {(["today", "week", "month", "custom"] as const).map((preset) => <button aria-pressed={periodPreset === preset} className={`min-h-9 rounded-md px-2 text-xs font-semibold capitalize transition-colors active:scale-[.98] sm:px-3 ${periodPreset === preset ? "bg-white text-emerald-900 shadow-sm" : "text-slate-600 hover:text-slate-900"}`} key={preset} onClick={() => preset === "custom" ? setPeriodPreset("custom") : selectPeriod(preset)} type="button">{preset}</button>)}
            </div>
            <div className="grid grid-cols-2 gap-2"><label className="text-xs font-semibold text-slate-600">From<input className="mt-1 block min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" onChange={(event) => { setLoading(true); setPeriodPreset("custom"); setFromDate(event.target.value); }} type="date" value={fromDate} /></label><label className="text-xs font-semibold text-slate-600">To<input className="mt-1 block min-h-9 w-full rounded-lg border border-slate-300 px-2 text-sm" onChange={(event) => { setLoading(true); setPeriodPreset("custom"); setToDate(event.target.value); }} type="date" value={toDate} /></label></div>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
        {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">{notice}</p>}
        {error && <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert"><CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={17} />{error}</p>}

        {loading ? <div className="grid gap-4 xl:grid-cols-2"><div className="animate-skeleton-shimmer h-64 rounded-xl bg-white" /><div className="animate-skeleton-shimmer h-64 rounded-xl bg-white" /></div> : (
          <>
            {report && <section aria-label="Financial summary" className="grid grid-cols-2 gap-px overflow-hidden border-y border-slate-200 bg-slate-200 sm:grid-cols-3 sm:rounded-xl sm:border xl:grid-cols-5">
              {[
                { label: "Accrued charges", amount: report.accruedChargesPaise },
                { label: "Collections", amount: report.collectedPaise },
                { label: "Outstanding", amount: report.outstandingPaise },
                { label: "Expenses", amount: report.expensesPaise },
                { label: "Net cash movement", amount: report.netCashMovementPaise },
              ].map((item) => <article className="bg-white px-3 py-4 sm:px-4" key={item.label}><p className="text-xs font-semibold text-slate-500">{item.label}</p><p className="mt-2 text-lg font-bold tabular-nums sm:text-xl">{formatPaise(item.amount)}</p></article>)}
            </section>}

            {report && <section aria-label="Income by payment method" className="grid gap-6 border-y border-slate-200 bg-white px-4 py-5 sm:rounded-xl sm:border sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] md:items-center">
              <div>
                <h2 className="font-bold">Income received</h2>
                <p className="mt-1 text-sm text-slate-500">Payment mix for {report.period.from} to {report.period.to}</p>
                <p className="mt-4 text-2xl font-black tabular-nums">{formatPaise(report.collectedPaise)}</p>
                <p className="text-xs text-slate-500">Total confirmed collections</p>
              </div>
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center">
                <div aria-label={`Payment method breakdown. Confirmed collections total ${formatPaise(report.collectedPaise)}.`} className="relative h-44 w-44 shrink-0 rounded-full" role="img" style={{ background: paymentChartGradient }}>
                  <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white text-center">
                    <span className="text-[10px] font-bold uppercase text-slate-500">Collected</span>
                    <span className="mt-1 text-sm font-black tabular-nums">{formatPaise(report.collectedPaise)}</span>
                  </div>
                </div>
                <ul className="grid w-full grid-cols-2 gap-x-4 gap-y-3 text-sm sm:w-auto sm:grid-cols-1">
                  {paymentSlices.length === 0 ? <li className="col-span-2 text-sm text-slate-500 sm:col-span-1">No payments in this period.</li> : paymentSlices.map((slice) => <li className="flex items-center justify-between gap-4" key={slice.method}><span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: slice.color }} />{paymentMethodLabels[slice.method] ?? slice.method}</span><strong className="tabular-nums">{formatPaise(slice.amount)}</strong></li>)}
                </ul>
              </div>
            </section>}

            {report && <section aria-label="Selected period financial charts" className="grid gap-5 xl:grid-cols-2">
              <article className="border-y border-slate-200 bg-white px-4 py-5 sm:rounded-xl sm:border sm:px-6 animate-page-enter">
                <div><h2 className="font-bold">Expense breakdown</h2><p className="mt-1 text-sm text-slate-500">Recorded expenses, {report.period.from} to {report.period.to}</p></div>
                {expenseTotal === 0 ? <p className="mt-5 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No expenses recorded in this period.</p> : <div className="mt-5 flex flex-col items-center gap-6 sm:flex-row">
                  <div aria-label={`Expense category breakdown totaling ${formatPaise(report.expensesPaise)}.`} className="relative h-40 w-40 shrink-0 rounded-full" role="img" style={{ background: expenseChartGradient }}>
                    <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white text-center"><span className="text-[10px] font-bold uppercase text-slate-500">Expenses</span><span className="mt-1 text-sm font-black tabular-nums">{formatPaise(report.expensesPaise)}</span></div>
                  </div>
                  <ul className="w-full space-y-2 text-sm">{expenseSlices.map((slice) => <li className="flex items-center justify-between gap-3" key={slice.category}><span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }}/><span className="truncate">{slice.label}</span></span><strong className="shrink-0 tabular-nums">{formatPaise(slice.amount)}</strong></li>)}</ul>
                </div>}
              </article>

              <article className="border-y border-slate-200 bg-white px-4 py-5 sm:rounded-xl sm:border sm:px-6 animate-page-enter">
                <div><h2 className="font-bold">Revenue versus expenses</h2><p className="mt-1 text-sm text-slate-500">Same selected period · {report.period.from} to {report.period.to}</p></div>
                {report.collectedPaise === 0 && report.expensesPaise === 0 ? <p className="mt-5 rounded-lg bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">No cash activity recorded in this period.</p> : <div aria-label={`Confirmed payments ${formatPaise(report.collectedPaise)} minus recorded expenses ${formatPaise(report.expensesPaise)} equals net cash profit ${formatPaise(report.netCashMovementPaise)}.`} className="mt-6 space-y-5" role="img">
                  {[
                    { label: "Payments received", amount: report.collectedPaise, color: "bg-emerald-700" },
                    { label: "Expenses recorded", amount: report.expensesPaise, color: "bg-rose-600" },
                  ].map((item) => <div key={item.label}><div className="mb-2 flex items-center justify-between gap-3 text-sm"><span className="font-semibold">{item.label}</span><strong className="tabular-nums">{formatPaise(item.amount)}</strong></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-[width] duration-300 ${item.color}`} style={{ width: `${Math.max((item.amount / Math.max(report.collectedPaise, report.expensesPaise, 1)) * 100, item.amount > 0 ? 2 : 0)}%` }}/></div></div>)}
                  <div className="border-t border-slate-100 pt-4 text-sm"><span className="text-slate-500">Net cash profit</span><strong className={`float-right tabular-nums ${report.netCashMovementPaise < 0 ? "text-rose-700" : "text-emerald-800"}`}>{formatPaise(report.netCashMovementPaise)}</strong></div>
                </div>}
              </article>
            </section>}

            <section aria-label="Student payment proof review" className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-6">
              <div className="flex items-center justify-between gap-3 px-4 sm:px-0">
                <div><h2 className="font-bold">Student payment proofs</h2><p className="mt-1 text-sm text-slate-500">Approve verified transfers to add them to collections, or mark them not paid.</p></div>
                <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-900">{paymentProofs.filter((proof) => proof.status === "pending").length} pending</span>
              </div>
              {paymentProofs.length === 0 ? <p className="mt-4 px-4 text-sm text-slate-500 sm:px-0">No student payment proofs are waiting for review.</p> : <div className="mt-5 grid gap-5 border-t border-slate-100 pt-5 lg:grid-cols-2">{paymentProofs.map((proof) => {
                const isPending = proof.status === "pending";
                const canApprove = isPending || proof.status === "approving";
                const canReject = isPending || proof.status === "rejecting";
                return <article className="grid gap-4 border-b border-slate-100 px-4 pb-5 last:border-0 sm:grid-cols-[minmax(0,1fr)_220px] sm:px-0" key={proof._id}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><h3 className="font-bold">{proof.student.fullName}</h3><p className="mt-1 text-xs text-slate-500">{proof.student.studentId} · {proof.subscription.plan} · {proof.method.replaceAll("_", " ")}</p></div>
                      <p className="text-lg font-black tabular-nums">{formatPaise(proof.amountPaise)}</p>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Submitted {new Date(proof.submittedAt).toLocaleString("en-IN")}</p>
                    {(canApprove || canReject) ? <div className="mt-4 grid grid-cols-2 gap-2">
                      <button className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg bg-emerald-800 px-3 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-50" disabled={reviewingProof === proof._id || !canApprove} onClick={() => void reviewPaymentProof(proof, "paid")} type="button"><CheckCircle2 aria-hidden="true" size={15} />{proof.status === "approving" ? "Retry paid" : "Mark paid"}</button>
                      <button className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={reviewingProof === proof._id || !canReject} onClick={() => void reviewPaymentProof(proof, "not_paid")} type="button"><XCircle aria-hidden="true" size={15} />{proof.status === "rejecting" ? "Retry not paid" : "Mark not paid"}</button>
                    </div> : <p className="mt-4 text-sm font-semibold text-amber-800">Review is processing. Refresh to check its status.</p>}
                    {proof.reviewNote && <p className="mt-3 text-xs text-slate-500">{proof.reviewNote}</p>}
                  </div>
                  <div className="relative aspect-[4/3] overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    <Image alt={`Payment screenshot from ${proof.student.fullName}`} className="object-contain" fill sizes="(max-width: 640px) 100vw, 220px" src={`/api/payment-proofs/${proof._id}/image`} unoptimized />
                  </div>
                </article>;
              })}</div>}
            </section>

            {report && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-950">{report.billingPolicy} {report.netCashMovementLabel}.</p>}

            <div className="grid gap-5 xl:grid-cols-2">
              <section className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-6">
                <div className="flex items-center gap-2"><CreditCard aria-hidden="true" className="text-emerald-800" size={19} /><h2 className="font-bold">Record received payment</h2></div>
                <p className="mt-1 text-sm text-slate-500">Only enter money actually received by the mess. Partial payments are supported.</p>
                <form className="mt-5 space-y-4" onSubmit={recordPayment}>
                  <label className="block text-sm font-semibold">Subscription
                    <select className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" onChange={(event) => { setSelectedSubscription(event.target.value); paymentKey.current = ""; }} required value={selectedSubscription}>
                      <option value="">Select a subscription</option>
                      {payables.map((item) => <option key={item.subscription._id} value={item.subscription._id}>{item.student.studentId} · {item.student.fullName} · {item.subscription.plan} · due {formatPaise(item.outstandingPaise)}</option>)}
                    </select>
                  </label>
                  {payable && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">Balance: <strong>{formatPaise(payable.outstandingPaise)}</strong></p>}
                  {payables.length === 0 && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">No outstanding subscription balances.</p>}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold">Amount (INR)
                      <input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" inputMode="decimal" onChange={(event) => { setPaymentAmount(event.target.value); paymentKey.current = ""; }} placeholder="e.g. 750.00" required value={paymentAmount} />
                    </label>
                    <label className="text-sm font-semibold">Method
                      <select className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(event) => { setPaymentMethod(event.target.value as typeof paymentMethod); paymentKey.current = ""; }} value={paymentMethod}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option></select>
                    </label>
                  </div>
                  <button className="min-h-11 w-full rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-60" disabled={saving || payables.length === 0} type="submit">{saving ? "Recording…" : "Record received payment"}</button>
                </form>
              </section>

              <section className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-6">
                <div className="flex items-center gap-2"><Wallet aria-hidden="true" className="text-emerald-800" size={19} /><h2 className="font-bold">Record expense</h2></div>
                <form className="mt-5 space-y-4" onSubmit={recordExpense}>
                  <label className="block text-sm font-semibold">Category
                    <select className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(event) => { setExpenseCategory(event.target.value as typeof expenseCategory); expenseKey.current = ""; }} value={expenseCategory}>{expenseCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold">Amount (INR)<input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" inputMode="decimal" onChange={(event) => { setExpenseAmount(event.target.value); expenseKey.current = ""; }} placeholder="e.g. 250.00" required value={expenseAmount} /></label>
                    <label className="text-sm font-semibold">Date<input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" onChange={(event) => { setExpenseDate(event.target.value); expenseKey.current = ""; }} required type="date" value={expenseDate} /></label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="text-sm font-semibold">Payment method
                      <select className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm" onChange={(event) => { setExpensePaymentMethod(event.target.value as typeof expensePaymentMethod); expenseKey.current = ""; }} value={expensePaymentMethod}><option value="cash">Cash</option><option value="upi">UPI</option><option value="bank_transfer">Bank transfer</option><option value="card">Card</option></select>
                    </label>
                    <label className="text-sm font-semibold">Reference (optional)<input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm" maxLength={120} onChange={(event) => { setExpenseReference(event.target.value); expenseKey.current = ""; }} placeholder="Receipt or transaction ID" value={expenseReference} /></label>
                  </div>
                  <label className="block text-sm font-semibold">Description<textarea className="mt-2 min-h-20 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm" maxLength={500} minLength={2} onChange={(event) => { setExpenseDescription(event.target.value); expenseKey.current = ""; }} required value={expenseDescription} /></label>
                  <button className="min-h-11 w-full rounded-lg border border-emerald-200 px-4 text-sm font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-60" disabled={saving} type="submit">{saving ? "Recording…" : "Record expense"}</button>
                </form>
              </section>
            </div>

            <section className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-6">
              <div className="flex items-center gap-2"><ReceiptIndianRupee aria-hidden="true" className="text-emerald-800" size={19} /><h2 className="font-bold">Expenses in selected period</h2></div>
              {expenses.length === 0 ? <p className="mt-4 text-sm text-slate-500">No expenses recorded in this period.</p> : <div className="mt-4 divide-y divide-slate-100">{expenses.map((expense) => <article className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm" key={expense._id}><div className="min-w-0"><p className="font-semibold">{expense.description}</p><p className="mt-1 text-xs capitalize text-slate-500">{expense.category?.replaceAll("_", " ") ?? "Uncategorized"} · {expense.paymentMethod?.replaceAll("_", " ") ?? "Unknown payment method"} · {expense.expenseDate?.slice(0, 10) ?? "Date unavailable"}{expense.reference ? ` · ${expense.reference}` : ""}</p></div><span className="font-bold tabular-nums">{formatPaise(expense.amountPaise)}</span><div className="flex items-center gap-2"><span className="text-xs capitalize text-slate-500">{expense.status}</span>{expense.status === "recorded" && <button aria-label={`Reverse expense: ${expense.description}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-800" onClick={() => { setExpenseToReverse(expense); setReversalReason(""); }} type="button"><RotateCcw aria-hidden="true" size={14}/>Reverse</button>}</div></article>)}</div>}
            </section>
          </>
        )}
      </div>
      {expenseToReverse && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/45 p-4" onClick={(event) => { if (event.target === event.currentTarget && !reversingExpense) setExpenseToReverse(null); }}>
        <section aria-labelledby="reverse-expense-title" aria-modal="true" className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-2xl animate-toast-enter" role="dialog">
          <h2 className="text-lg font-bold" id="reverse-expense-title">Reverse expense</h2>
          <p className="mt-2 text-sm text-slate-600">This keeps the original record for audit. To correct it, reverse this entry and record a new one.</p>
          <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm"><strong>{expenseToReverse.description}</strong> · {formatPaise(expenseToReverse.amountPaise)}</p>
          <form className="mt-4 space-y-4" onSubmit={reverseSelectedExpense}>
            <label className="block text-sm font-semibold" htmlFor="expense-reversal-reason">Reason
              <textarea autoFocus className="mt-2 min-h-24 w-full resize-y rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" id="expense-reversal-reason" maxLength={500} minLength={8} onChange={(event) => setReversalReason(event.target.value)} required value={reversalReason}/>
            </label>
            <div className="flex justify-end gap-2">
              <button className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50" disabled={reversingExpense} onClick={() => setExpenseToReverse(null)} type="button">Cancel</button>
              <button className="min-h-10 rounded-lg bg-rose-700 px-3 text-sm font-bold text-white hover:bg-rose-800 disabled:opacity-50" disabled={reversingExpense || reversalReason.trim().length < 8} type="submit">{reversingExpense ? "Reversing…" : "Confirm reversal"}</button>
            </div>
          </form>
        </section>
      </div>}
    </main>
  );
}
