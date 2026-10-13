"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Check, CircleAlert, ExternalLink, Save, Trash2, X } from "lucide-react";

type Proof = { _id: string; amountPaise: number; utr: string; status: string; submittedAt: string; reviewNote?: string; student?: { fullName: string; studentId: string }; subscription?: { plan: string; startDate: string; endDate: string } };
type Envelope<T> = { ok: boolean; data?: T; error?: { message: string } };
const money = (n: number) => `₹${(n / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
const date = (v?: string) => v ? new Date(v).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function PaymentsClient() {
  const [proofs, setProofs] = useState<Proof[]>([]);
  const [upiId, setUpiId] = useState("");
  const [qrUrl, setQrUrl] = useState("");
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrPreview, setQrPreview] = useState("");
  const [removeQr, setRemoveQr] = useState(false);
  const [qrInputKey, setQrInputKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { if (!qrPreview) return; return () => URL.revokeObjectURL(qrPreview); }, [qrPreview]);
  async function load() {
    try {
      const [p, s] = await Promise.all([fetch("/api/payment-proofs"), fetch("/api/payment-settings")]);
      const [pr, sr] = await Promise.all([p.json() as Promise<Envelope<{ proofs: Proof[] }>>, s.json() as Promise<Envelope<{ upiId: string; qrUrl: string }>>]);
      if (!p.ok || !pr.ok || !s.ok || !sr.ok) throw new Error("Could not load payment management");
      setProofs(pr.data?.proofs ?? []); setUpiId(sr.data?.upiId ?? ""); setQrUrl(sr.data?.qrUrl ?? "");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load payments"); } finally { setLoading(false); }
  }
  useEffect(() => { const timer = window.setTimeout(() => { void load(); }, 0); return () => window.clearTimeout(timer); }, []);
  async function saveUpi() {
    setBusy("settings"); setError(""); setMessage("");
    try { const formData = new FormData(); formData.set("upiId", upiId); formData.set("removeQr", String(removeQr)); if (qrFile) formData.set("qrImage", qrFile); const r = await fetch("/api/payment-settings", { method: "PUT", body: formData }); const x = await r.json() as Envelope<{ upiId: string; qrUrl: string }>; if (!r.ok || !x.ok) throw new Error(x.error?.message ?? "Could not save payment settings"); setUpiId(x.data?.upiId ?? ""); setQrUrl(x.data?.qrUrl ?? ""); setQrFile(null); setQrPreview(""); setRemoveQr(false); setQrInputKey((key) => key + 1); setMessage("Payment settings saved."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save UPI ID"); } finally { setBusy(""); }
  }
  function selectQr(file?: File) {
    setError(""); setMessage("");
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) { setError("Choose a PNG, JPEG, or WebP image no larger than 2 MB."); setQrInputKey((key) => key + 1); return; }
    setQrFile(file); setQrPreview(URL.createObjectURL(file)); setRemoveQr(false);
  }
  async function review(proof: Proof, decision: "paid" | "not_paid") {
    const reviewNote = decision === "not_paid" ? window.prompt("Optional rejection reason") ?? "" : "";
    if (decision === "not_paid" && !window.confirm("Reject this payment submission?")) return;
    if (decision === "paid" && !window.confirm("Confirm you verified the actual UPI transaction and received the funds?")) return;
    setBusy(proof._id); setError(""); setMessage("");
    try { const r = await fetch(`/api/payment-proofs/${proof._id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, reviewNote }) }); const x = await r.json() as Envelope<{ proof: Proof }>; if (!r.ok || !x.ok) throw new Error(x.error?.message ?? "Could not review payment"); setProofs((list) => list.map((item) => item._id === proof._id ? { ...item, status: decision === "paid" ? "approved" : "rejected", reviewNote } : item)); setMessage(decision === "paid" ? "Payment approved and added to the ledger." : "Payment rejected."); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not review payment"); }
    finally { setBusy(""); }
  }
  return <main className="mx-auto max-w-6xl space-y-6 px-4 py-7 sm:px-8"><header><p className="text-xs font-bold uppercase tracking-widest text-indigo-700">Finance</p><h1 className="mt-1 text-3xl font-bold tracking-tight">Payments</h1><p className="mt-2 text-sm text-slate-600">Review UPI submissions. Approve only after checking the actual transaction in the owner’s UPI app or bank statement.</p></header>
    {message && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{message}</p>}{error && <p role="alert" className="flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"><CircleAlert size={18}/>{error}</p>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div><h2 className="font-bold">Payment Settings</h2><p className="mt-1 text-sm text-slate-500">Configure the real mess owner UPI ID and optional payment QR image shown to students.</p></div><label className="mt-5 block text-sm font-semibold">Mess owner UPI ID<input aria-label="Mess owner UPI ID" autoComplete="off" className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3 font-normal" maxLength={100} placeholder="name@bank" value={upiId} onChange={(e) => setUpiId(e.target.value)}/></label><div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(220px,320px)] md:items-start"><div><label className="block text-sm font-semibold" htmlFor="payment-qr-upload">UPI QR image <span className="font-normal text-slate-500">(PNG, JPEG, or WebP; max 2 MB)</span></label><input key={qrInputKey} id="payment-qr-upload" accept="image/png,image/jpeg,image/webp" className="mt-2 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:font-semibold file:text-indigo-800" onChange={(e) => selectQr(e.target.files?.[0])} type="file"/><p className="mt-2 text-xs text-slate-500">Upload the real QR and ensure it resolves to the same UPI ID above. The app cannot verify account ownership from an image; students should confirm the recipient in their UPI app before paying.</p>{(qrUrl || qrFile) && <button className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-800 hover:bg-rose-50" onClick={() => { setQrFile(null); setQrPreview(""); setQrInputKey((key) => key + 1); setRemoveQr(true); }} type="button"><Trash2 size={16}/>{removeQr ? "QR image will be removed on save" : "Remove QR image"}</button>}</div><div className="rounded-xl border border-slate-200 bg-slate-50 p-3"><p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">{qrFile ? "New image preview" : qrUrl && !removeQr ? "Currently saved QR" : "QR preview"}</p>{(qrPreview || (qrUrl && !removeQr)) ? <Image alt="UPI QR image preview" className="mx-auto h-auto max-h-72 w-full rounded-lg bg-white object-contain" height={320} src={qrPreview || qrUrl} unoptimized width={320}/> : <p className="flex min-h-40 items-center justify-center px-3 text-center text-sm text-slate-500">No QR image saved. UPI ID payment remains available.</p>}</div></div><div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center"><button disabled={busy === "settings" || loading} onClick={() => void saveUpi()} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-700 px-5 font-bold text-white disabled:opacity-50"><Save size={17}/>{busy === "settings" ? "Saving…" : "Save Payment Settings"}</button>{loading && <p className="text-sm text-slate-500" role="status">Loading saved settings…</p>}{message && <p className="text-sm font-medium text-emerald-800" role="status">{message}</p>}{error && <p className="text-sm font-medium text-rose-800" role="alert">{error}</p>}</div></section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-100 px-5 py-4"><h2 className="font-bold">Student submissions</h2></div>{loading ? <p className="p-6 text-sm text-slate-500">Loading payments…</p> : proofs.length === 0 ? <p className="p-6 text-sm text-slate-500">No payment submissions yet.</p> : <div className="divide-y divide-slate-100">{proofs.map((p) => <article key={p._id} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto]"><div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3"><div><p className="text-xs text-slate-500">Student</p><p className="font-bold">{p.student?.fullName ?? "Student"} · {p.student?.studentId ?? ""}</p></div><div><p className="text-xs text-slate-500">Plan / billing period</p><p className="font-semibold capitalize">{p.subscription?.plan ?? "—"} · {date(p.subscription?.startDate)} – {date(p.subscription?.endDate)}</p></div><div><p className="text-xs text-slate-500">Amount / UTR</p><p className="font-semibold">{money(p.amountPaise)} · {p.utr}</p></div><div><p className="text-xs text-slate-500">Submitted / status</p><p className="font-semibold">{date(p.submittedAt)} · <span className="capitalize">{p.status === "approved" ? "Paid" : p.status === "pending" ? "Pending Verification" : p.status}</span></p></div>{p.reviewNote && <p className="text-xs text-slate-600">Note: {p.reviewNote}</p>}</div><div className="flex flex-wrap items-center gap-2"><a target="_blank" rel="noreferrer" href={`/api/payment-proofs/${p._id}/image`} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold"><ExternalLink size={16}/>Screenshot</a>{p.status === "pending" && <><button disabled={!!busy} onClick={() => void review(p, "paid")} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-emerald-700 px-3 text-sm font-bold text-white disabled:opacity-50"><Check size={16}/>Approve</button><button disabled={!!busy} onClick={() => void review(p, "not_paid")} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-rose-700 px-3 text-sm font-bold text-white disabled:opacity-50"><X size={16}/>Reject</button></>}</div></article>)}</div>}</section></main>;
}
