import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";

export default function LoginPage() {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center text-sm text-slate-600" role="status">Checking session…</main>}><LoginContent /></Suspense>;
}

async function LoginContent() {
  const session = await getCurrentSession();
  if (session?.role === "admin") redirect("/admin/dashboard");
  if (session?.role === "student") redirect("/portal");

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f4f7f4] px-4 py-10 text-slate-900">
      <section className="w-full max-w-lg rounded-3xl border border-emerald-100 bg-white p-7 shadow-xl sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-800">Abhishek Mess</p>
        <h1 className="mt-3 text-3xl font-black tracking-tight">Log in</h1>
        <p className="mt-2 text-sm text-slate-600">Choose the account type for your secure sign-in.</p>
        <div className="mt-7 grid gap-3 sm:grid-cols-2">
          <Link className="flex min-h-12 items-center justify-center rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white hover:bg-emerald-900" href="/admin/login">Administrator login</Link>
          <Link className="flex min-h-12 items-center justify-center rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-800 hover:bg-slate-50" href="/student/login">Student login</Link>
        </div>
        <Link className="mt-6 inline-block text-sm font-semibold text-emerald-800 hover:underline" href="/">Back to home</Link>
      </section>
    </main>
  );
}
