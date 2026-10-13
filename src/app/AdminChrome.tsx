"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  CalendarCheck,
  CreditCard,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UtensilsCrossed,
  Users,
  X,
} from "lucide-react";
import SignOutButton from "./SignOutButton";

const navigation = [
  { label: "Overview", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "All Students & Attendance", href: "/students", icon: Users },
  { label: "Meals & service", href: "/meals", icon: UtensilsCrossed },
  { label: "Attendance", href: "/attendance", icon: CalendarCheck },
  { label: "Finance & reports", href: "/finance", icon: CreditCard },
  { label: "Payments", href: "/payments", icon: CreditCard },
] as const;

export default function AdminChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isWorkspace = navigation.some(({ href }) => href === pathname) && pathname !== "/admin/dashboard";

  if (!isWorkspace) return children;

  const activeItem = navigation.find(({ href }) => href === pathname);

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 top-14 z-40 bg-slate-950/40 lg:hidden" onClick={() => setMobileOpen(false)} type="button" />}

      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
        <Link className="flex items-center gap-2.5" href="/admin/dashboard" onClick={() => setMobileOpen(false)}>
          <Image alt="" aria-hidden="true" className="h-8 w-8" height={32} src="/abhishek-mess-icon.svg" width={32} />
          <span className="text-sm font-extrabold text-slate-900">Abhishek Mess</span>
        </Link>
        <button aria-expanded={mobileOpen} aria-label={mobileOpen ? "Close menu" : "Open menu"} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 active:scale-[.97]" onClick={() => setMobileOpen((open) => !open)} type="button">
          {mobileOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </header>

      <aside className={`fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col border-r border-slate-200 bg-white transition-[width,transform] duration-200 lg:top-0 ${collapsed ? "lg:w-[76px]" : "lg:w-[248px]"} ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className={`flex h-[72px] items-center gap-3 border-b border-slate-100 px-4 ${collapsed ? "lg:justify-center lg:px-2" : ""}`}>
          <Image alt="" aria-hidden="true" className="h-10 w-10 shrink-0" height={40} src="/abhishek-mess-icon.svg" width={40} />
          <div className={collapsed ? "lg:hidden" : ""}>
            <p className="text-base font-extrabold tracking-tight text-slate-900">Abhishek Mess</p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-800">Smart Mess Management</p>
          </div>
          <button aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="ml-auto hidden rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 lg:block" onClick={() => setCollapsed((current) => !current)} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} type="button">
            {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
          <button aria-label="Close menu" className="ml-auto rounded-lg p-2 text-slate-500 lg:hidden" onClick={() => setMobileOpen(false)} type="button"><X size={18} /></button>
        </div>

        <nav aria-label="Admin workspace" className={`space-y-1 px-3 py-5 ${collapsed ? "lg:px-2" : ""}`}>
          {navigation.map(({ label, href, icon: Icon }) => {
            const active = href === pathname;
            return (
              <Link aria-current={active ? "page" : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors active:scale-[.99] ${collapsed ? "lg:justify-center lg:px-0" : ""} ${active ? "bg-indigo-50 text-indigo-950 ring-1 ring-indigo-100" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`} href={href} key={href} onClick={() => setMobileOpen(false)} title={collapsed ? label : undefined}>
                <Icon aria-hidden="true" size={18} />
                <span className={collapsed ? "lg:hidden" : ""}>{label}</span>
                {active && <span className={`ml-auto h-5 w-1 rounded-full bg-indigo-700 ${collapsed ? "lg:hidden" : ""}`} />}
              </Link>
            );
          })}
        </nav>

        <div className={`mt-auto border-t border-slate-100 p-3 ${collapsed ? "lg:px-2" : ""}`}>
          <div className={`mb-2 px-2 text-xs font-semibold text-slate-500 ${collapsed ? "lg:hidden" : ""}`}>{activeItem?.label ?? "Admin workspace"}</div>
          <div className={`flex items-center gap-2 rounded-lg bg-slate-50 px-2 py-1.5 ${collapsed ? "lg:flex-col" : ""}`}>
            <span className={`min-w-0 flex-1 truncate text-xs font-semibold text-slate-700 ${collapsed ? "lg:hidden" : ""}`}>Administrator</span>
            <SignOutButton />
          </div>
        </div>
      </aside>

      <div className={`min-h-screen pt-14 transition-[padding] duration-200 lg:pt-0 ${collapsed ? "lg:pl-[76px]" : "lg:pl-[248px]"}`}>
        {children}
      </div>
    </div>
  );
}
