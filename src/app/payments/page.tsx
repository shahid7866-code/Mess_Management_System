import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import PaymentsClient from "./PaymentsClient";

export default function PaymentsPage() {
  return <Suspense fallback={<main className="p-8 text-sm text-slate-600" role="status">Loading payments…</main>}><AuthenticatedPaymentsPage /></Suspense>;
}

async function AuthenticatedPaymentsPage() {
  const user = await getCurrentSession();
  if (!user) redirect("/login");
  if (user.role !== "admin") redirect("/portal");
  return <PaymentsClient />;
}
import { Suspense } from "react";
