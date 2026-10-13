"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import SignOutButton from "./SignOutButton";
import {
  LayoutDashboard,
  Users,
  UtensilsCrossed,
  CalendarCheck,
  CreditCard,
  ReceiptIndianRupee,
  Wallet,
  Sun,
  Moon,
  ArrowUpRight,
  Menu,
  X,
  Leaf,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

interface DashboardMealSession {
  isOpen: boolean;
  summary: { eligible: number; present: number; absent: number; onLeave: number; notMarked: number };
}

interface DashboardData {
  date: string;
  adminName: string;
  activeStudents: number;
  eligibleAfternoon: number;
  eligibleNight: number;
  attendance: { afternoon: DashboardMealSession; night: DashboardMealSession };
  menu: { afternoonItems: string[]; nightItems: string[] } | null;
  holiday: { reason: string; attendanceExceptionAllowed: boolean } | null;
  todayCollectionsPaise: number;
  monthlyCollectionsPaise: number;
  todayExpensesPaise: number;
  monthlyExpensesPaise: number;
  monthlyNetCashProfitPaise: number;
  monthlyExpensesByCategory: Array<{ category: string; amountPaise: number }>;
  outstandingPaise: number;
}

interface ChartSlice {
  label: string;
  amount: number;
  color: string;
}

function formatPaise(amount: number): string {
  return `₹${(amount / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function pieGradient(slices: ChartSlice[]): string {
  const total = slices.reduce((sum, slice) => sum + slice.amount, 0);
  if (total === 0) return "#e5ece8";

  let cursor = 0;
  const stops = slices.map((slice) => {
    const start = cursor;
    cursor += (slice.amount / total) * 100;
    return `${slice.color} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

export default function DashboardClient({ data }: { data: DashboardData }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pathname = usePathname();
  const navItems = [
    { name: "Overview", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: "All Students & Attendance", href: "/students", icon: Users },
    { name: "Meal Management", href: "/meals", icon: UtensilsCrossed },
    { name: "Attendance", href: "/attendance", icon: CalendarCheck },
    { name: "Payments & expenses", href: "/finance", icon: CreditCard },
  ];
  const active = navItems.find((item) => item.href === pathname)?.name ?? "Overview";
  const afternoon = data.attendance.afternoon;
  const night = data.attendance.night;
  const serviceDate = new Date(`${data.date}T00:00:00.000Z`).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const categoryLabels: Record<string, string> = {
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
  const expenseColors = ["#4f46e5", "#0f766e", "#7c3aed", "#e11d48", "#0891b2", "#64748b", "#ea580c"];
  const expenseSlices = data.monthlyExpensesByCategory.map((entry, index) => ({
    label: categoryLabels[entry.category] ?? entry.category.replaceAll("_", " "),
    amount: entry.amountPaise,
    color: expenseColors[index % expenseColors.length],
  }));
  const attendanceSlices: ChartSlice[] = [
    { label: "Present", amount: afternoon.summary.present + night.summary.present, color: "#059669" },
    { label: "Absent", amount: afternoon.summary.absent + night.summary.absent, color: "#e11d48" },
    { label: "On leave", amount: afternoon.summary.onLeave + night.summary.onLeave, color: "#d97706" },
    { label: "Not marked", amount: afternoon.summary.notMarked + night.summary.notMarked, color: "#94a3b8" },
  ].filter((slice) => slice.amount > 0);
  const attendanceTotal = attendanceSlices.reduce((sum, slice) => sum + slice.amount, 0);
  const cashFlowMax = Math.max(data.monthlyCollectionsPaise, data.monthlyExpensesPaise, 1);

  return (
    <main className="min-h-screen bg-[#f4f6fb] text-slate-900 animate-page-enter">
      {menuOpen && (
        <button aria-label="Close menu backdrop" onClick={() => setMenuOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden" />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[255px] flex-col border-r border-slate-200 bg-white transition-[width,transform] duration-200 lg:translate-x-0 ${sidebarCollapsed ? "lg:w-[76px]" : "lg:w-[255px]"} ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className={`flex h-[78px] items-center gap-3 border-b border-slate-100 px-4 ${sidebarCollapsed ? "lg:justify-center lg:px-2" : ""}`}>
          <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-slate-900 shadow-lg shadow-indigo-700/20">
            <Image src="/abhishek-mess-icon.svg" alt="Abhishek Mess" width={36} height={36} className="h-9 w-9 object-contain" />
          </div>
          <div className={sidebarCollapsed ? "lg:hidden" : ""}>
            <h1 className="text-lg font-extrabold tracking-tight text-slate-900">Abhishek Mess</h1>
            <p className="text-[10px] font-bold tracking-[.18em] text-indigo-600">SMART MESS MANAGEMENT</p>
          </div>
          <button className="ml-auto hidden rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:block" onClick={() => setSidebarCollapsed((collapsed) => !collapsed)} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} type="button">
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
          <button className="ml-auto rounded-lg p-2 text-slate-500 lg:hidden" onClick={() => setMenuOpen(false)} aria-label="Close navigation" type="button"><X size={19}/></button>
        </div>

        <div className={`px-4 pt-7 ${sidebarCollapsed ? "lg:px-2" : ""}`}>
          <p className={`mb-3 px-3 text-[10px] font-bold uppercase tracking-[.2em] text-slate-400 ${sidebarCollapsed ? "lg:hidden" : ""}`}>Workspace</p>
          <nav className="space-y-1">
            {navItems.map(({ name, href, icon: Icon }) => (
              <Link
                aria-current={active === name ? "page" : undefined}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${sidebarCollapsed ? "lg:justify-center lg:px-0" : ""} ${active === name ? "bg-indigo-50 text-indigo-950 ring-1 ring-indigo-100" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
                href={href}
                key={name}
                onClick={() => setMenuOpen(false)}
                title={sidebarCollapsed ? name : undefined}
              >
                <Icon aria-hidden="true" size={19}/><span className={sidebarCollapsed ? "lg:hidden" : ""}>{name}</span>
                {active === name && <span className={`ml-auto h-5 w-1 rounded-full bg-indigo-700 ${sidebarCollapsed ? "lg:hidden" : ""}`}/ >}
              </Link>
            ))}
          </nav>
        </div>

        <div className={`mt-auto p-4 ${sidebarCollapsed ? "lg:p-2" : ""}`}>
          <div className={`rounded-xl bg-[#123c32] p-4 text-white ${sidebarCollapsed ? "lg:hidden" : ""}`}>
            <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-400/15 text-emerald-300"><Leaf size={20}/></div>
            <p className="text-sm font-bold">Your mess, simplified.</p>
            <p className="mt-1 text-xs leading-5 text-slate-400">Meals, students and finances in one place.</p>
            <div className="mt-4 h-1.5 rounded-full bg-white/10"><div className="h-full w-2/3 rounded-full bg-emerald-400"/></div>
            <p className="mt-2 text-[10px] text-slate-400">Workspace foundation</p>
          </div>
          <div className={`mt-4 flex items-center gap-3 px-2 py-2 ${sidebarCollapsed ? "lg:mt-0 lg:flex-col lg:px-0" : ""}`}>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-800">{data.adminName.charAt(0).toUpperCase() || "A"}</div>
            <div className={sidebarCollapsed ? "lg:hidden" : ""}><p className="text-sm font-bold">{data.adminName}</p><p className="text-xs text-slate-400">Administrator</p></div>
            <SignOutButton />
          </div>
        </div>
      </aside>

      <section className={`min-h-screen transition-[padding] duration-200 ${sidebarCollapsed ? "lg:pl-[76px]" : "lg:pl-[255px]"}`}>
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-8">
          <div className="flex items-center gap-3">
            <button onClick={() => setMenuOpen(true)} aria-label="Open navigation" className="rounded-xl border border-slate-200 p-2 lg:hidden"><Menu size={20}/></button>
            <div><p className="text-xs text-slate-400">Workspace / {active}</p><h2 className="mt-1 text-xl font-extrabold tracking-tight">{active}</h2></div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <time className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600" dateTime={data.date}>{serviceDate}</time>
          </div>
        </header>

        <div className="mx-auto max-w-[1500px] space-y-7 p-4 sm:p-8">
          <section className="flex flex-col gap-5 border-y border-slate-200 bg-white px-5 py-6 sm:rounded-xl sm:border sm:px-7 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">Today · {serviceDate}</p>
              <h3 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Welcome, {data.adminName}.</h3>
              <p className="mt-2 text-sm text-slate-600">Your attendance, collections, expenses, and outstanding balances at a glance.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/attendance" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-indigo-700 px-4 text-sm font-bold text-white shadow-sm shadow-indigo-900/15 transition hover:bg-indigo-800 active:scale-[.98]">Open attendance <ArrowUpRight size={16}/></Link>
              <Link href="/students" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-indigo-200 bg-white px-4 text-sm font-semibold text-indigo-950 transition hover:bg-indigo-50 active:scale-[.98]">All Students & Attendance</Link>
              <Link href="/meals" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:scale-[.98]">Meal & holiday settings</Link>
            </div>
          </section>

          <section aria-label="Business overview" className="grid grid-cols-2 gap-px overflow-hidden border-y border-slate-200 bg-slate-200 sm:rounded-xl sm:border sm:grid-cols-3 2xl:grid-cols-4">
            {[
              { label: "Active students", value: String(data.activeStudents), detail: "Student accounts", icon: Users, tone: "bg-blue-50 text-blue-700" },
              { label: "Afternoon present", value: `${afternoon.summary.present} / ${afternoon.summary.eligible}`, detail: `${afternoon.summary.absent} absent · ${afternoon.summary.notMarked} not marked`, icon: Sun, tone: "bg-emerald-50 text-emerald-800" },
              { label: "Night present", value: `${night.summary.present} / ${night.summary.eligible}`, detail: `${night.summary.absent} absent · ${night.summary.notMarked} not marked`, icon: Moon, tone: "bg-cyan-50 text-cyan-800" },
              { label: "Collections this month", value: formatPaise(data.monthlyCollectionsPaise), detail: "Confirmed payments received", icon: CreditCard, tone: "bg-emerald-50 text-emerald-800" },
              { label: "Outstanding dues", value: formatPaise(data.outstandingPaise), detail: "Accrued through today", icon: Wallet, tone: "bg-amber-50 text-amber-800" },
              { label: "Expenses this month", value: formatPaise(data.monthlyExpensesPaise), detail: "Recorded business expenses", icon: ReceiptIndianRupee, tone: "bg-rose-50 text-rose-800" },
              { label: "Net cash profit", value: formatPaise(data.monthlyNetCashProfitPaise), detail: "Collections minus expenses", icon: ArrowUpRight, tone: data.monthlyNetCashProfitPaise >= 0 ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800" },
            ].map(({ label, value, detail, icon: Icon, tone }) => (
              <article key={label} className="min-w-0 bg-white p-4 transition-colors hover:bg-[#fcfdfb] sm:p-5">
                <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs font-semibold text-slate-500 sm:text-sm">{label}</p><p className="mt-2 break-words text-xl font-extrabold tabular-nums tracking-tight sm:text-2xl">{value}</p></div><div className={`shrink-0 rounded-lg p-2.5 ${tone}`}><Icon aria-hidden="true" size={19}/></div></div>
                <p className="mt-2 text-xs text-slate-500">{detail}</p>
              </article>
            ))}
          </section>

          <section aria-label="Monthly financial charts" className="grid gap-5 xl:grid-cols-3">
            <article className="border-y border-slate-200 bg-white px-4 py-5 sm:rounded-xl sm:border sm:px-5 animate-page-enter">
              <div><h3 className="font-bold">Expense breakdown</h3><p className="mt-1 text-xs text-slate-500">Recorded expenses this month</p></div>
              {expenseSlices.length === 0 ? <p className="mt-6 rounded-lg bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">No expenses recorded this month.</p> : <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
                <div aria-label={`Expense breakdown for this month, total ${formatPaise(data.monthlyExpensesPaise)}.`} className="relative h-36 w-36 shrink-0 rounded-full" role="img" style={{ background: pieGradient(expenseSlices) }}>
                  <div className="absolute inset-6 flex flex-col items-center justify-center rounded-full bg-white text-center"><span className="text-[10px] font-bold uppercase text-slate-500">Total</span><span className="mt-1 text-sm font-black tabular-nums">{formatPaise(data.monthlyExpensesPaise)}</span></div>
                </div>
                <ul className="w-full space-y-2 text-xs">{expenseSlices.map((slice) => <li className="flex items-center justify-between gap-3" key={slice.label}><span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: slice.color }}/><span className="truncate">{slice.label}</span></span><strong className="shrink-0 tabular-nums">{formatPaise(slice.amount)}</strong></li>)}</ul>
              </div>}
            </article>

            <article className="border-y border-slate-200 bg-white px-4 py-5 sm:rounded-xl sm:border sm:px-5 animate-page-enter">
              <div><h3 className="font-bold">Revenue vs expenses</h3><p className="mt-1 text-xs text-slate-500">Cash activity this month</p></div>
              <div aria-label={`This month, received ${formatPaise(data.monthlyCollectionsPaise)} and recorded expenses ${formatPaise(data.monthlyExpensesPaise)}.`} className="mt-6 space-y-5" role="img">
                {[{ label: "Received", value: data.monthlyCollectionsPaise, color: "bg-emerald-700" }, { label: "Expenses", value: data.monthlyExpensesPaise, color: "bg-rose-600" }].map((item) => <div key={item.label}><div className="mb-2 flex items-center justify-between gap-2 text-sm"><span className="font-semibold">{item.label}</span><strong className="tabular-nums">{formatPaise(item.value)}</strong></div><div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-[width] duration-300 ${item.color}`} style={{ width: `${Math.max((item.value / cashFlowMax) * 100, item.value > 0 ? 2 : 0)}%` }}/></div></div>)}
              </div>
              <div className="mt-6 border-t border-slate-100 pt-4 text-sm"><span className="text-slate-500">Net cash profit</span><strong className={`float-right tabular-nums ${data.monthlyNetCashProfitPaise < 0 ? "text-rose-700" : "text-emerald-800"}`}>{formatPaise(data.monthlyNetCashProfitPaise)}</strong></div>
            </article>

            <article className="border-y border-slate-200 bg-white px-4 py-5 sm:rounded-xl sm:border sm:px-5 animate-page-enter">
              <div><h3 className="font-bold">Attendance overview</h3><p className="mt-1 text-xs text-slate-500">Afternoon and night today</p></div>
              {attendanceTotal === 0 ? <p className="mt-6 rounded-lg bg-slate-50 px-3 py-5 text-center text-sm text-slate-500">No eligible meals today.</p> : <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row xl:flex-col 2xl:flex-row">
                <div aria-label={`Attendance overview across both meals: ${attendanceSlices.map((slice) => `${slice.label} ${slice.amount}`).join(", ")}.`} className="relative h-36 w-36 shrink-0 rounded-full" role="img" style={{ background: pieGradient(attendanceSlices) }}>
                  <div className="absolute inset-6 flex flex-col items-center justify-center rounded-full bg-white text-center"><span className="text-[10px] font-bold uppercase text-slate-500">Meal seats</span><span className="mt-1 text-sm font-black tabular-nums">{attendanceTotal}</span></div>
                </div>
                <ul className="w-full space-y-2 text-xs">{attendanceSlices.map((slice) => <li className="flex items-center justify-between gap-3" key={slice.label}><span className="flex items-center gap-2"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: slice.color }}/>{slice.label}</span><strong className="tabular-nums">{slice.amount}</strong></li>)}</ul>
              </div>}
            </article>
          </section>

          <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.45fr_1fr]">
            <article className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-extrabold tracking-tight">Today&apos;s attendance</h3><p className="mt-1 text-sm text-slate-400">Not Marked stays separate from Absent.</p></div><Link className="text-sm font-bold text-emerald-800 hover:underline" href="/attendance">Open attendance</Link></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                {[{ name: "Afternoon", href: "/attendance", data: afternoon }, { name: "Night", href: "/attendance", data: night }].map((session) => (
                  <section className="rounded-xl border border-slate-200 p-4" key={session.name}>
                    <div className="flex items-center justify-between"><h4 className="font-bold">{session.name}</h4><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${session.data.isOpen ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{session.data.isOpen ? "Open" : "Closed"}</span></div>
                    <p className="mt-2 text-xs text-slate-500">{session.data.summary.eligible} eligible · {session.data.summary.present} present · {session.data.summary.absent} absent · {session.data.summary.onLeave} on leave · {session.data.summary.notMarked} not marked</p>
                  </section>
                ))}
              </div>
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 border-t border-slate-100 pt-4 text-sm"><p>Collected today <strong className="ml-1">{formatPaise(data.todayCollectionsPaise)}</strong></p><p>Expenses today <strong className="ml-1">{formatPaise(data.todayExpensesPaise)}</strong></p></div>
            </article>

            <div className="space-y-6">
              <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between"><div><h3 className="font-extrabold tracking-tight">Today&apos;s menu</h3><p className="mt-1 text-sm text-slate-400">{data.date}</p></div><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-800"><UtensilsCrossed size={20}/></div></div>
                {data.holiday ? <p className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Holiday: {data.holiday.reason}</p> : <div className="mt-5 space-y-3">{[{ label: "AFTERNOON", items: data.menu?.afternoonItems ?? [], icon: Sun }, { label: "NIGHT", items: data.menu?.nightItems ?? [], icon: Moon }].map(({ label, items, icon: Icon }) => <div className="rounded-xl bg-slate-50 p-4" key={label}><div className="flex items-center gap-2 text-xs font-extrabold text-emerald-800"><Icon aria-hidden="true" size={15}/> {label}</div><p className="mt-2 text-sm">{items.length ? items.join(", ") : "Menu not published"}</p></div>)}</div>}
                <Link href="/meals" className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 py-3 text-sm font-bold transition hover:bg-slate-50">Manage menu <ArrowUpRight size={16}/></Link>
              </article>

              <article className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex items-center gap-2"><div className="rounded-xl bg-emerald-50 p-2.5 text-emerald-700"><CreditCard size={20}/></div><div><h3 className="font-extrabold tracking-tight">Subscription plans</h3><p className="text-xs text-slate-400">Monthly pricing</p></div></div>
                <div className="mt-5 space-y-4">{[{ name: "Afternoon only", price: "₹1,500" }, { name: "Night only", price: "₹1,500" }, { name: "Both meals", price: "₹3,000" }].map((plan) => <div key={plan.name} className="flex items-center justify-between gap-3"><p className="text-sm text-slate-600">{plan.name}</p><p className="text-sm font-extrabold">{plan.price}<span className="font-normal text-slate-400">/mo</span></p></div>)}</div>
                <Link href="/finance" className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 py-3 text-sm font-bold text-white transition hover:bg-emerald-800">View payments <ArrowUpRight size={16}/></Link>
              </article>
            </div>
          </section>

          <footer className="flex flex-col gap-2 border-t border-slate-200 py-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between"><p>Abhishek Mess · Smart Mess Management</p><p>Monthly collections {formatPaise(data.monthlyCollectionsPaise)} · expenses {formatPaise(data.monthlyExpensesPaise)}</p></footer>
        </div>
      </section>
    </main>
  );
}
