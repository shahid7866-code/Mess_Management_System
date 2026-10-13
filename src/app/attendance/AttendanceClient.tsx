"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleAlert,
  Clock3,
  Moon,
  Sun,
  UtensilsCrossed,
} from "lucide-react";

type Meal = "afternoon" | "night";
type AttendanceStatus = "present" | "absent" | "on_leave" | "not_marked";

interface AttendanceStudent {
  _id: string;
  studentId: string;
  fullName: string;
  email?: string;
  phone?: string;
  attendance: {
    id?: string;
    status: AttendanceStatus;
    markedAt: string | null;
  };
}

interface AttendanceData {
  serviceDate: string;
  meal: Meal;
  timezone: string;
  schedule: { openingTime: string; closingTime: string };
  isOpen: boolean;
  localTime: string;
  holiday: { reason: string; attendanceExceptionAllowed: boolean } | null;
  menu: { afternoonItems: string[]; nightItems: string[] } | null;
  students: AttendanceStudent[];
  summary: {
    eligible: number;
    present: number;
    absent: number;
    onLeave: number;
    notMarked: number;
  };
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

const statuses: Array<{ value: AttendanceStatus; label: string }> = [
  { value: "present", label: "Present" },
  { value: "absent", label: "Absent" },
  { value: "on_leave", label: "On Leave" },
  { value: "not_marked", label: "Not Marked" },
];

function indiaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function AttendanceClient() {
  const [meal, setMeal] = useState<Meal>("afternoon");
  const [date, setDate] = useState(indiaDate);
  const [data, setData] = useState<AttendanceData | null>(null);
  const [search, setSearch] = useState("");
  const [correctionReason, setCorrectionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [mutatingStudent, setMutatingStudent] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    let requestPending = false;

    async function loadAttendance() {
      if (requestPending || controller.signal.aborted) return;
      requestPending = true;
      try {
        const response = await fetch(`/api/attendance?date=${encodeURIComponent(date)}&meal=${meal}`, {
          signal: controller.signal,
        });
        const result = (await response.json()) as ApiEnvelope<AttendanceData>;
        if (!response.ok || !result.ok || !result.data) {
          throw new Error(result.error?.message ?? "Could not load attendance");
        }
        setData(result.data);
        setError("");
      } catch (loadError: unknown) {
        if (loadError instanceof Error && loadError.name !== "AbortError") {
          setError(loadError.message);
        }
      } finally {
        requestPending = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadAttendance();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void loadAttendance();
    }, 15_000);

    return () => {
      window.clearInterval(interval);
      controller.abort();
    };
  }, [date, meal, refreshKey]);

  async function mark(student: AttendanceStudent, status: AttendanceStatus) {
    setMutatingStudent(student._id);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student._id,
          serviceDate: date,
          meal,
          status,
          correctionReason: correctionReason || undefined,
        }),
      });
      const result = (await response.json()) as ApiEnvelope<unknown>;
      if (!response.ok || !result.ok) {
        throw new Error(result.error?.message ?? "Could not update attendance");
      }
      setNotice(`${student.fullName}: ${statuses.find((item) => item.value === status)?.label}.`);
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (markError: unknown) {
      setError(markError instanceof Error ? markError.message : "Could not update attendance");
    } finally {
      setMutatingStudent(null);
    }
  }

  const visibleStudents = (data?.students ?? []).filter((student) => {
    const normalizedSearch = search.trim().toLowerCase();
    return (
      !normalizedSearch ||
      student.fullName.toLowerCase().includes(normalizedSearch) ||
      student.studentId.toLowerCase().includes(normalizedSearch)
    );
  });
  const menuItems = meal === "afternoon" ? data?.menu?.afternoonItems : data?.menu?.nightItems;
  const correctionNeeded = Boolean(
    data && (!data.isOpen || data.holiday?.attendanceExceptionAllowed),
  );
  const holidayBlocksAttendance = Boolean(
    data?.holiday && !data.holiday.attendanceExceptionAllowed,
  );

  return (
    <main className="min-h-screen bg-[#f3f6f3] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
          <div><p className="text-xs font-semibold text-emerald-800">ABHISHEK MESS / ADMIN</p><h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Attendance</h1></div>
          <label className="text-sm font-semibold">Service date
            <input className="ml-2 min-h-10 rounded-lg border border-slate-300 px-2 text-sm focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" onChange={(event) => { setLoading(true); setDate(event.target.value); }} type="date" value={date} />
          </label>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
        {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">{notice}</p>}
        {error && <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert"><CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={17} />{error}</p>}

        <section aria-label="Meal session" className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-2">
          <button aria-pressed={meal === "afternoon"} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg text-sm font-bold transition ${meal === "afternoon" ? "bg-emerald-800 text-white" : "text-slate-600 hover:bg-slate-50"}`} onClick={() => { setLoading(true); setMeal("afternoon"); }} type="button"><Sun aria-hidden="true" size={18} />Afternoon</button>
          <button aria-pressed={meal === "night"} className={`flex min-h-12 items-center justify-center gap-2 rounded-lg text-sm font-bold transition ${meal === "night" ? "bg-emerald-800 text-white" : "text-slate-600 hover:bg-slate-50"}`} onClick={() => { setLoading(true); setMeal("night"); }} type="button"><Moon aria-hidden="true" size={18} />Night</button>
        </section>

        {data?.holiday && <div className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${data.holiday.attendanceExceptionAllowed ? "border-amber-200 bg-amber-50 text-amber-900" : "border-rose-200 bg-rose-50 text-rose-900"}`} role="status"><AlertTriangle aria-hidden="true" className="mt-0.5 shrink-0" size={18} /><p><strong>Mess holiday:</strong> {data.holiday.reason}{data.holiday.attendanceExceptionAllowed ? " An authorized attendance exception is enabled; a correction reason is required." : " Attendance is blocked."}</p></div>}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <article className="min-w-0 border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3 px-4 sm:px-0">
              <div><h2 className="font-bold">{meal === "afternoon" ? "Afternoon" : "Night"} session</h2><p className="mt-1 text-sm text-slate-500">{data ? `${data.schedule.openingTime}–${data.schedule.closingTime} · ${data.timezone}` : "Loading schedule…"}</p></div>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${data?.isOpen ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}><span className={`h-2 w-2 rounded-full ${data?.isOpen ? "bg-emerald-600" : "bg-slate-400"}`} />{data?.isOpen ? "Open" : "Closed"}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-px border-y border-slate-200 bg-slate-200 sm:grid-cols-5">
              {[
                { label: "Eligible", value: data?.summary.eligible ?? 0 },
                { label: "Present", value: data?.summary.present ?? 0 },
                { label: "Absent", value: data?.summary.absent ?? 0 },
                { label: "On leave", value: data?.summary.onLeave ?? 0 },
                { label: "Not marked", value: data?.summary.notMarked ?? 0 },
              ].map((item) => <div className="bg-white px-3 py-3 text-center sm:px-2" key={item.label}><p className="text-lg font-bold tabular-nums">{item.value}</p><p className="mt-0.5 text-xs text-slate-500">{item.label}</p></div>)}
            </div>

            {correctionNeeded && (
              <label className="mt-5 block px-4 text-sm font-semibold sm:px-0">Correction reason <span className="font-normal text-slate-500">(required for a closed session or holiday exception)</span>
                <input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" maxLength={500} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Explain the authorized correction" value={correctionReason} />
              </label>
            )}

            <label className="relative mt-5 block px-4 sm:px-0">
              <span className="sr-only">Search eligible students</span>
              <input className="min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" onChange={(event) => setSearch(event.target.value)} placeholder="Search eligible students" value={search} />
            </label>

            <div aria-live="polite" className="mt-4 divide-y divide-slate-100 border-t border-slate-200">
              {loading ? <p className="px-4 py-8 text-center text-sm text-slate-500" role="status">Loading eligible students…</p> : visibleStudents.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No eligible students for this session and date.</p> : visibleStudents.map((student) => (
                <article className="space-y-3 px-4 py-4 sm:flex sm:items-center sm:justify-between sm:gap-4 sm:space-y-0" key={student._id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{student.fullName}</p>
                    <p className="mt-1 text-xs text-slate-500">{student.studentId}</p>
                  </div>
                  <div aria-label={`Attendance status for ${student.fullName}`} className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                    {statuses.map((status) => (
                      <button
                        aria-pressed={student.attendance.status === status.value}
                        className={`min-h-10 rounded-lg border px-2.5 text-xs font-bold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50 ${student.attendance.status === status.value ? "border-emerald-700 bg-emerald-50 text-emerald-900" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"}`}
                        disabled={mutatingStudent === student._id || holidayBlocksAttendance || (correctionNeeded && correctionReason.trim().length < 8)}
                        key={status.value}
                        onClick={() => void mark(student, status.value)}
                        type="button"
                      >
                        {student.attendance.status === status.value && <Check aria-hidden="true" className="mr-1 inline" size={13} />}
                        {status.label}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </article>

          <aside className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-5">
            <div className="flex items-center gap-2 px-4 sm:px-0"><UtensilsCrossed aria-hidden="true" className="text-emerald-800" size={18} /><h2 className="font-bold">Today&apos;s menu</h2></div>
            {menuItems?.length ? <ul className="mt-4 space-y-2 px-4 text-sm text-slate-700 sm:px-0">{menuItems.map((item) => <li className="flex items-start gap-2" key={item}><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-600" />{item}</li>)}</ul> : <p className="mt-3 px-4 text-sm text-slate-500 sm:px-0">No menu has been published for this date.</p>}
            <div className="mt-5 border-t border-slate-200 px-4 pt-4 sm:px-0">
              <p className="text-xs font-bold uppercase text-slate-500">Attendance states</p>
              <p className="mt-2 flex items-center gap-2 text-xs text-slate-600"><Clock3 aria-hidden="true" size={14} />Not Marked is not counted as Absent.</p>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}