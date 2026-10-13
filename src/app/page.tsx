
import type { ReactNode } from "react";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles, UserRound, UtensilsCrossed } from "lucide-react";
import { getCurrentSession } from "@/lib/auth";

export default function Home() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f7f8f5] text-sm font-medium text-emerald-900" role="status">
          Loading Abhishek Mess…
        </main>
      }
    >
      <LandingContent />
    </Suspense>
  );
}

async function LandingContent() {
  const session = await getCurrentSession();

  if (session?.role === "admin") {
    redirect("/admin/dashboard");
  }

  if (session?.role === "student") {
    redirect("/portal");
  }

  return (
    <main className="min-h-screen bg-[#f7f8f5] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4 rounded-full border border-emerald-200 bg-white/80 px-4 py-3 shadow-sm backdrop-blur-sm sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-700 to-emerald-500 shadow-sm shadow-emerald-700/20">
              <UtensilsCrossed className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-lg font-black tracking-tight text-slate-900">Abhishek Mess</div>
              <div className="text-[10px] font-bold tracking-[0.22em] text-emerald-700">SMART MESS MANAGEMENT</div>
            </div>
          </div>

          <div className="hidden items-center gap-3 sm:flex">
            <Link className="text-sm font-semibold text-slate-700 transition hover:text-emerald-700" href="/admin/login">Admin Login</Link>
            <Link className="text-sm font-semibold text-slate-700 transition hover:text-emerald-700" href="/student/login">Student Login</Link>
          </div>
        </header>

        <section className="relative overflow-hidden rounded-[32px] border border-emerald-100 bg-gradient-to-br from-[#0d4b3d] via-[#0f5a49] to-[#ecfdf5] px-6 py-10 text-white shadow-[0_32px_80px_rgba(5,48,38,0.18)] sm:px-10 lg:px-14 lg:py-16">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.22),_transparent_32%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.18),_transparent_30%)]" aria-hidden="true" />
          <div className="relative grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div className="max-w-xl animate-[fadeInUp_220ms_ease-out]">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-[0.18em] text-emerald-100">
                <Sparkles className="h-3.5 w-3.5" />
                Smart mess operations
              </div>
              <h1 className="mt-6 text-4xl font-black tracking-tight sm:text-5xl lg:text-6xl">
                Smarter Meals. <span className="text-emerald-200">Simpler Management.</span>
              </h1>
              <p className="mt-5 max-w-lg text-base leading-7 text-emerald-50/80 sm:text-lg">
                Abhishek Mess gives hosts, students, and administrators one streamlined platform for meal planning, attendance, billing, and daily operations.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/admin/login" className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-emerald-900 transition hover:-translate-y-0.5 hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  Admin Login <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/student/login" className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/5 px-5 py-3 text-sm font-bold text-white transition hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  Student Login
                </Link>
              </div>

              <ul className="mt-8 flex flex-wrap gap-4 text-sm text-emerald-50/80">
                {[
                  "Live attendance tracking",
                  "Subscription management",
                  "Daily menu visibility",
                ].map((item) => (
                  <li key={item} className="inline-flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="grid gap-4 animate-[fadeInUp_240ms_ease-out]">
              <PortalCard
                href="/admin/login"
                title="Admin Portal"
                description="Manage students, meals, attendance, subscriptions, payments, and reports."
                icon={<ShieldCheck className="h-6 w-6" />}
                primaryLabel="Admin Login"
                secondaryLabel="Authorized onboarding only"
              />
              <PortalCard
                href="/student/login"
                title="Student Portal"
                description="View your meal plan, today's menu, attendance, subscription, and payments."
                icon={<UserRound className="h-6 w-6" />}
                primaryLabel="Student Login"
                secondaryLabel="Create account"
              />
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-emerald-100 bg-white/80 py-6 text-sm text-slate-600">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
              <UtensilsCrossed className="h-4 w-4" />
            </div>
            <div>
              <div className="font-bold text-slate-900">Abhishek Mess</div>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Smart Mess Management</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/admin/login" className="transition hover:text-emerald-700">Admin</Link>
            <Link href="/student/login" className="transition hover:text-emerald-700">Student</Link>
            <Link href="/student/register" className="transition hover:text-emerald-700">Register</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}

function PortalCard({
  title,
  description,
  href,
  icon,
  primaryLabel,
  secondaryLabel,
}: {
  title: string;
  description: string;
  href: string;
  icon: ReactNode;
  primaryLabel: string;
  secondaryLabel: string;
}) {
  return (
    <div className="group rounded-[28px] border border-emerald-100 bg-white/95 p-5 text-slate-900 shadow-lg shadow-slate-200/60 transition duration-200 hover:-translate-y-1 hover:shadow-xl focus-within:ring-2 focus-within:ring-emerald-700/30">
      <div className="flex items-center justify-between gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
          {icon}
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-800">
          Portal
        </span>
      </div>

      <h2 className="mt-5 text-2xl font-bold tracking-tight">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-slate-600">{description}</p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Link href={href} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800">
          {primaryLabel} <ArrowRight className="h-4 w-4" />
        </Link>
        {secondaryLabel ? (
          <Link href={title === "Admin Portal" ? "/admin/login" : "/student/register"} className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-emerald-200 hover:text-emerald-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
            {secondaryLabel}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
