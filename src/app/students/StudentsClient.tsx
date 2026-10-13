"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock3,
  CircleAlert,
  CreditCard,
  Plus,
  Save,
  Search,
  UserRoundPlus,
  X,
} from "lucide-react";

interface StudentSummary {
  _id: string;
  studentId: string;
  fullName: string;
  email?: string;
  phone?: string;
  role: "admin" | "student";
  status: "active" | "inactive";
  createdAt: string;
}

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { message: string };
}

interface StudentListData {
  students: StudentSummary[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

interface CreateStudentData {
  student: StudentSummary;
}

interface StudentSubscription {
  _id: string;
  plan: "afternoon" | "night" | "both";
  startDate: string;
  endDate: string;
  monthlyAmountPaise: number;
  status: "active" | "expired" | "cancelled";
}

type AttendanceStatus = "present" | "absent" | "on_leave" | "not_marked";
interface StudentAttendanceRecord {
  date: string;
  meal: "afternoon" | "night";
  status: AttendanceStatus;
  markedAt: string;
  note?: string;
}

interface StudentHoliday { serviceDate: string; reason: string }
interface TodayAttendanceSummary {
  afternoon: { present: number; absent: number; notMarked: number };
  night: { present: number; absent: number; notMarked: number };
  byStudent: Record<string, { afternoon?: AttendanceStatus; night?: AttendanceStatus }>;
}

const initialForm = {
  studentId: "",
  fullName: "",
  email: "",
  phone: "",
  password: "",
};

function currentIndiaMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return `${year}-${month}`;
}

function currentIndiaDate(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export default function StudentsClient() {
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [pagination, setPagination] = useState<StudentListData["pagination"]>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [editingStudent, setEditingStudent] = useState<StudentSummary | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", email: "", phone: "" });
  const [subscriptionStudent, setSubscriptionStudent] = useState<StudentSummary | null>(null);
  const [subscriptions, setSubscriptions] = useState<StudentSubscription[]>([]);
  const [subscriptionPlan, setSubscriptionPlan] = useState<"afternoon" | "night" | "both">("afternoon");
  const [subscriptionStart, setSubscriptionStart] = useState("");
  const [subscriptionEnd, setSubscriptionEnd] = useState("");
  const [subscriptionError, setSubscriptionError] = useState("");
  const [isLoadingSubscriptions, setIsLoadingSubscriptions] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [formError, setFormError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [detailStudent, setDetailStudent] = useState<StudentSummary | null>(null);
  const [attendanceMonth, setAttendanceMonth] = useState(currentIndiaMonth);
  const [attendanceRecords, setAttendanceRecords] = useState<StudentAttendanceRecord[]>([]);
  const [isLoadingAttendance, setIsLoadingAttendance] = useState(false);
  const [attendanceError, setAttendanceError] = useState("");
  const [attendanceHolidays, setAttendanceHolidays] = useState<StudentHoliday[]>([]);
  const [detailSubscriptions, setDetailSubscriptions] = useState<StudentSubscription[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [historyStatus, setHistoryStatus] = useState<"all" | AttendanceStatus>("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [todaySummary, setTodaySummary] = useState<TodayAttendanceSummary | null>(null);
  const [todayDate, setTodayDate] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(currentIndiaDate);
  const [registeredTotal, setRegisteredTotal] = useState(0);
  const [attendanceFilter, setAttendanceFilter] = useState<"all" | AttendanceStatus>("all");
  const [historyFrom, setHistoryFrom] = useState(() => `${currentIndiaMonth()}-01`);
  const [historyTo, setHistoryTo] = useState(currentIndiaDate);

  useEffect(() => {
    if (!detailStudent) return;
    const controller = new AbortController();
    const [year, month] = attendanceMonth.split("-").map(Number);
    const monthStart = `${attendanceMonth}-01`;
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    Promise.all([
      fetch(`/api/students/${detailStudent._id}/attendance?month=${attendanceMonth}`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`/api/holidays?from=${monthStart}&to=${monthEnd}`, { signal: controller.signal }).then((response) => response.json()),
      fetch(`/api/students/${detailStudent._id}/subscriptions`, { signal: controller.signal }).then((response) => response.json()),
    ]).then(([attendanceResult, holidayResult, subscriptionResult]) => {
        if (!attendanceResult.ok || !holidayResult.ok || !subscriptionResult.ok) throw new Error("Could not load student history");
        setAttendanceRecords(attendanceResult.data.attendance);
        setAttendanceHolidays(holidayResult.data.holidays);
        setDetailSubscriptions(subscriptionResult.data.subscriptions);
        setAttendanceError("");
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name !== "AbortError") setAttendanceError(loadError.message);
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoadingAttendance(false); });
    return () => controller.abort();
  }, [detailStudent, attendanceMonth]);

  useEffect(() => {
    const controller = new AbortController();
    const date = attendanceDate;
    Promise.all((["afternoon", "night"] as const).map(async (meal) => {
      const response = await fetch(`/api/attendance?date=${date}&meal=${meal}`, { signal: controller.signal });
      const result = await response.json() as ApiEnvelope<{ students: Array<{ _id: string; attendance: { status: AttendanceStatus } }>; summary: { present: number; absent: number; notMarked: number } }>;
      if (!response.ok || !result.ok || !result.data) throw new Error("Could not load today's attendance summary");
      return { meal, data: result.data };
    })).then((results) => {
      const summary: TodayAttendanceSummary = {
        afternoon: { present: 0, absent: 0, notMarked: 0 },
        night: { present: 0, absent: 0, notMarked: 0 },
        byStudent: {},
      };
      for (const { meal, data } of results) {
        summary[meal] = { present: data.summary.present, absent: data.summary.absent, notMarked: data.summary.notMarked };
        for (const student of data.students) summary.byStudent[student._id] = { ...summary.byStudent[student._id], [meal]: student.attendance.status };
      }
      setTodaySummary(summary);
      setTodayDate(date);
    }).catch((loadError: unknown) => {
      if (loadError instanceof Error && loadError.name !== "AbortError") setError(loadError.message);
    });
    return () => controller.abort();
  }, [attendanceDate]);

  useEffect(() => {
    const controller = new AbortController();
    const parameters = new URLSearchParams({ page: String(page), limit: "20" });
    if (search.trim()) parameters.set("search", search.trim());
    if (status !== "all") parameters.set("status", status);

    fetch(`/api/students?${parameters.toString()}`, { signal: controller.signal })
      .then(async (response) => {
        const result = (await response.json()) as ApiEnvelope<StudentListData>;
        if (!response.ok || !result.ok || !result.data) {
          throw new Error(result.error?.message ?? "Could not load students");
        }
        setStudents(result.data.students);
        setPagination(result.data.pagination);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name !== "AbortError") {
          setError(loadError.message);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [page, refreshKey, search, status]);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/students?page=1&limit=1", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as ApiEnvelope<StudentListData>;
        if (!response.ok || !result.ok || !result.data) throw new Error("Could not load total student count");
        setRegisteredTotal(result.data.pagination.total);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name !== "AbortError") setError(loadError.message);
      });
    return () => controller.abort();
  }, [refreshKey]);

  async function createStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setIsLoading(true);
    setNotice("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          email: form.email || undefined,
          phone: form.phone || undefined,
        }),
      });
      const result = (await response.json()) as ApiEnvelope<CreateStudentData>;

      if (!response.ok || !result.ok || !result.data) {
        setFormError(result.error?.message ?? "Could not create the student");
        return;
      }

      setNotice(`Student ${result.data.student.studentId} created.`);
      setForm(initialForm);
      setIsCreating(false);
      setPage(1);
      setSearch(result.data.student.studentId);
      setRefreshKey((current) => current + 1);
    } catch {
      setFormError("A connection error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function deactivateStudent(student: StudentSummary) {
    if (!window.confirm(`Deactivate ${student.fullName}? Their history will be retained.`)) {
      return;
    }

    setMutatingId(student._id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/students/${student._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "inactive" }),
      });
      const result = (await response.json()) as ApiEnvelope<{ student: StudentSummary }>;
      if (!response.ok || !result.ok) {
        throw new Error(result.error?.message ?? "Could not update student status");
      }
      setNotice(`${student.studentId} was deactivated. History was retained.`);
      setRefreshKey((current) => current + 1);
    } catch (updateError: unknown) {
      setError(updateError instanceof Error ? updateError.message : "Could not update student");
    } finally {
      setMutatingId(null);
    }
  }

  function beginEditing(student: StudentSummary) {
    setEditingStudent(student);
    setEditForm({
      fullName: student.fullName,
      email: student.email ?? "",
      phone: student.phone ?? "",
    });
    setIsCreating(false);
  }

  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingStudent) return;

    setMutatingId(editingStudent._id);
    setError("");
    try {
      const response = await fetch(`/api/students/${editingStudent._id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...editForm,
          email: editForm.email || "",
          phone: editForm.phone || "",
        }),
      });
      const result = (await response.json()) as ApiEnvelope<{ student: StudentSummary }>;
      if (!response.ok || !result.ok) {
        throw new Error(result.error?.message ?? "Could not update student details");
      }
      setNotice(`${editingStudent.studentId} was updated.`);
      setEditingStudent(null);
      setRefreshKey((current) => current + 1);
    } catch (updateError: unknown) {
      setError(updateError instanceof Error ? updateError.message : "Could not update student");
    } finally {
      setMutatingId(null);
    }
  }

  async function openSubscriptions(student: StudentSummary) {
    setSubscriptionStudent(student);
    setSubscriptionError("");
    setIsLoadingSubscriptions(true);
    try {
      const response = await fetch(`/api/students/${student._id}/subscriptions`);
      const result = (await response.json()) as ApiEnvelope<{ subscriptions: StudentSubscription[] }>;
      if (!response.ok || !result.ok || !result.data) {
        throw new Error(result.error?.message ?? "Could not load subscriptions");
      }
      setSubscriptions(result.data.subscriptions);
    } catch (loadError: unknown) {
      setSubscriptionError(loadError instanceof Error ? loadError.message : "Could not load subscriptions");
    } finally {
      setIsLoadingSubscriptions(false);
    }
  }

  async function createSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!subscriptionStudent) return;

    setIsLoadingSubscriptions(true);
    setSubscriptionError("");
    try {
      const response = await fetch(`/api/students/${subscriptionStudent._id}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: subscriptionPlan,
          startDate: subscriptionStart,
          endDate: subscriptionEnd,
        }),
      });
      const result = (await response.json()) as ApiEnvelope<{ subscription: StudentSubscription }>;
      if (!response.ok || !result.ok || !result.data) {
        throw new Error(result.error?.message ?? "Could not create subscription");
      }
      setSubscriptions((current) => [result.data!.subscription, ...current]);
      setSubscriptionStart("");
      setSubscriptionEnd("");
      setNotice(`Subscription created for ${subscriptionStudent.studentId}.`);
    } catch (createError: unknown) {
      setSubscriptionError(createError instanceof Error ? createError.message : "Could not create subscription");
    } finally {
      setIsLoadingSubscriptions(false);
    }
  }

  function showStudentDetails(student: StudentSummary) {
    setAttendanceError("");
    setIsLoadingAttendance(true);
    setDetailStudent(student);
    setAttendanceRecords([]);
    setAttendanceHolidays([]);
    setDetailSubscriptions([]);
    const month = currentIndiaMonth();
    const today = currentIndiaDate();
    setAttendanceMonth(month);
    setHistoryFrom(`${month}-01`);
    setHistoryTo(today);
    setSelectedDate(today);
    setHistoryPage(1);
    setAttendanceFilter("all");
  }

  function moveAttendanceMonth(offset: number) {
    const [year, month] = attendanceMonth.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
    const lastDay = new Date(Date.UTC(Number(next.slice(0, 4)), Number(next.slice(5, 7)), 0)).getUTCDate();
    setIsLoadingAttendance(true);
    setAttendanceRecords([]);
    setAttendanceHolidays([]);
    setAttendanceMonth(next);
    setHistoryFrom(`${next}-01`);
    setHistoryTo(`${next}-${String(lastDay).padStart(2, "0")}`);
    setHistoryPage(1);
  }

  const trackedDays = new Set(attendanceRecords.map((record) => record.date));
  const presentDays = new Set(attendanceRecords.filter((record) => record.status === "present").map((record) => record.date));
  const absentDays = new Set(attendanceRecords.filter((record) => record.status === "absent").map((record) => record.date));
  const accountableRecords = attendanceRecords.filter((record) => record.status === "present" || record.status === "absent");
  const attendanceRate = accountableRecords.length ? Math.round((accountableRecords.filter((record) => record.status === "present").length / accountableRecords.length) * 100) : null;
  const historyRecords = attendanceRecords.filter((record) => record.date >= historyFrom && record.date <= historyTo && (historyStatus === "all" || record.status === historyStatus));
  const historyPageCount = Math.max(1, Math.ceil(historyRecords.length / 8));
  const visibleHistory = historyRecords.slice((historyPage - 1) * 8, historyPage * 8);
  const currentPlan = detailSubscriptions.find((subscription) => subscription.status === "active")?.plan ?? detailSubscriptions[0]?.plan;
  const visibleStudents = students.filter((student) => attendanceFilter === "all" || todaySummary?.byStudent[student._id]?.afternoon === attendanceFilter || todaySummary?.byStudent[student._id]?.night === attendanceFilter);
  const presentToday = (todaySummary?.afternoon.present ?? 0) + (todaySummary?.night.present ?? 0);
  const absentToday = (todaySummary?.afternoon.absent ?? 0) + (todaySummary?.night.absent ?? 0);

  return (
    <main className="min-h-screen bg-[#f4f3ed] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-[92px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
          <div>
            <p className="text-xs font-bold tracking-[0.18em] text-amber-700">ABHISHEK MESS / ADMIN</p>
            <h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">All Students &amp; Attendance</h1>
          </div>
          <button
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white transition hover:bg-emerald-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-800"
            onClick={() => { setIsCreating((open) => !open); setFormError(""); }}
            type="button"
          >
            {isCreating ? <X aria-hidden="true" size={17} /> : <Plus aria-hidden="true" size={17} />}
            <span>{isCreating ? "Close" : "Add student"}</span>
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
        {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">{notice}</p>}
        {error && <p className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert"><CircleAlert aria-hidden="true" className="mt-0.5 shrink-0" size={17} />{error}</p>}

        <section aria-label="Student and attendance overview" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-bold text-slate-800">Attendance snapshot</h2><p className="text-xs text-slate-500">Counts reflect eligible meal sessions for the selected date.</p></div><label className="text-xs font-semibold text-slate-600">Service date <input className="ml-2 min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-sm" onChange={(event) => { if (event.target.value) { setTodaySummary(null); setTodayDate(""); setAttendanceDate(event.target.value); } }} type="date" value={attendanceDate} /></label></div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <OverviewCard label="Registered students" value={registeredTotal.toLocaleString("en-IN")} detail="All student accounts" tone="indigo" />
            <OverviewCard label="Present" value={todaySummary ? presentToday.toLocaleString("en-IN") : "—"} detail={todayDate ? `Across afternoon and night · ${todayDate}` : "Attendance summary"} tone="green" />
            <OverviewCard label="Absent" value={todaySummary ? absentToday.toLocaleString("en-IN") : "—"} detail="Recorded absences only" tone="red" />
            <OverviewCard label="Awaiting mark" value={todaySummary ? ((todaySummary.afternoon.notMarked + todaySummary.night.notMarked).toLocaleString("en-IN")) : "—"} detail="Eligible meal sessions" tone="neutral" />
          </div>
        </section>

        {detailStudent && (
          <section aria-labelledby="student-detail-title" className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm">
            <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-800 px-5 py-6 text-white sm:px-7">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-violet-200">Student profile</p><h2 className="mt-2 text-2xl font-bold" id="student-detail-title">{detailStudent.fullName}</h2><p className="mt-1 text-sm text-indigo-100">{detailStudent.studentId} · Joined {new Date(detailStudent.createdAt).toLocaleDateString("en-IN", { dateStyle: "medium" })}</p></div>
                <button aria-label="Close student details" className="rounded-lg border border-white/25 px-3 py-2 text-sm font-semibold hover:bg-white/10" onClick={() => setDetailStudent(null)} type="button">Close</button>
              </div>
            </div>
            <div className="grid gap-3 border-b border-slate-100 p-4 sm:grid-cols-2 sm:p-6 lg:grid-cols-4">
              <DetailField label="Email" value={detailStudent.email ?? "Not provided"} />
              <DetailField label="Phone" value={detailStudent.phone ?? "Not provided"} />
              <DetailField label="Account status" value={detailStudent.status === "active" ? "Active" : "Inactive"} />
              <DetailField label="Meal plan" value={currentPlan ? currentPlan === "both" ? "Two meals · Afternoon & night" : `${currentPlan === "afternoon" ? "Afternoon" : "Night"} meal` : "No subscription recorded"} />
            </div>
            <div className="p-4 sm:p-6">
              <h3 className="mb-3 text-sm font-bold text-slate-700">Attendance summary · {attendanceMonth}</h3>
              <div className="mb-6 grid grid-cols-2 gap-2 lg:grid-cols-5">
                <CompactStat label="Days tracked" value={trackedDays.size} />
                <CompactStat label="Present days" value={presentDays.size} tone="green" />
                <CompactStat label="Absent days" value={absentDays.size} tone="red" />
                <CompactStat label="Unmarked meals" value={attendanceRecords.filter((record) => record.status === "not_marked").length} />
                <CompactStat label="Attendance rate" value={attendanceRate === null ? "—" : `${attendanceRate}%`} tone="indigo" />
              </div>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2"><CalendarDays aria-hidden="true" className="text-emerald-800" size={19} /><div><h3 className="font-bold">Attendance calendar</h3><p className="text-xs text-slate-500">Recorded afternoon and night meals</p></div></div>
                <div className="flex flex-wrap items-center gap-2">
                  <button aria-label="Previous month" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50" onClick={() => moveAttendanceMonth(-1)} type="button"><ChevronLeft size={17} /></button>
                  <span className="min-w-28 text-center text-sm font-bold">{new Date(`${attendanceMonth}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</span>
                  <button aria-label="Next month" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50" onClick={() => moveAttendanceMonth(1)} type="button"><ChevronRight size={17} /></button>
                  <button className="min-h-10 rounded-lg bg-indigo-50 px-3 text-xs font-bold text-indigo-900 hover:bg-indigo-100" onClick={() => { const month = currentIndiaMonth(); setIsLoadingAttendance(true); setAttendanceRecords([]); setAttendanceHolidays([]); setAttendanceMonth(month); setHistoryFrom(`${month}-01`); setHistoryTo(currentIndiaDate()); setSelectedDate(currentIndiaDate()); setHistoryPage(1); }} type="button">Today</button>
                  <input aria-label="Choose attendance month" className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold" onChange={(event) => { const month = event.target.value; if (!month) return; const [year, monthNumber] = month.split("-").map(Number); const last = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate(); setIsLoadingAttendance(true); setAttendanceRecords([]); setAttendanceHolidays([]); setAttendanceMonth(month); setHistoryFrom(`${month}-01`); setHistoryTo(`${month}-${String(last).padStart(2, "0")}`); setHistoryPage(1); }} type="month" value={attendanceMonth} />
                </div>
              </div>
              <div className="mb-3 flex flex-wrap gap-3 text-xs font-semibold text-slate-600"><Legend color="bg-emerald-500" label="Present" /><Legend color="bg-rose-500" label="Absent" /><Legend color="bg-amber-400" label="On leave" /><Legend color="bg-slate-300" label="Holiday" /><Legend color="bg-slate-100" label="Not marked" /><Legend color="bg-indigo-600" label="Selected date" /></div>
              {attendanceError && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{attendanceError}</p>}
              {isLoadingAttendance ? <p className="py-8 text-center text-sm text-slate-500" role="status">Loading attendance calendar…</p> : <AttendanceCalendar month={attendanceMonth} records={attendanceRecords} holidays={attendanceHolidays} selectedDate={selectedDate} onSelectDate={setSelectedDate} />}
              <section aria-label="Selected date attendance details" className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
                <h4 className="font-bold text-indigo-950">{selectedDate ? new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "Select a date"}</h4>
                {attendanceHolidays.find((holiday) => holiday.serviceDate.slice(0, 10) === selectedDate) && <p className="mt-1 text-sm text-slate-600">Holiday · {attendanceHolidays.find((holiday) => holiday.serviceDate.slice(0, 10) === selectedDate)?.reason}</p>}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(["afternoon", "night"] as const).map((meal) => {
                    const record = attendanceRecords.find((item) => item.date === selectedDate && item.meal === meal);
                    return <div className="rounded-lg border border-white bg-white p-3" key={meal}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{meal} meal</p><p className={`mt-1 text-sm font-bold ${record?.status === "present" ? "text-emerald-700" : record?.status === "absent" ? "text-rose-700" : "text-slate-600"}`}>{record ? statusLabel(record.status) : "Not marked"}</p>{record && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><Clock3 size={12} />{new Date(record.markedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}{record.note ? ` · ${record.note}` : ""}</p>}</div>;
                  })}
                </div>
              </section>
              <section aria-labelledby="attendance-history-title" className="mt-7">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-bold" id="attendance-history-title">Attendance history</h3><p className="mt-1 text-xs text-slate-500">Recorded sessions in the selected date range</p></div><div className="flex flex-wrap gap-2"><input aria-label="History start date" className="min-h-10 rounded-lg border border-slate-300 px-2 text-xs" max={historyTo} onChange={(event) => { setHistoryFrom(event.target.value); setHistoryPage(1); }} type="date" value={historyFrom} /><input aria-label="History end date" className="min-h-10 rounded-lg border border-slate-300 px-2 text-xs" min={historyFrom} onChange={(event) => { setHistoryTo(event.target.value); setHistoryPage(1); }} type="date" value={historyTo} /><select aria-label="Filter attendance history by status" className="min-h-10 rounded-lg border border-slate-300 bg-white px-2 text-xs" onChange={(event) => { setHistoryStatus(event.target.value as typeof historyStatus); setHistoryPage(1); }} value={historyStatus}><option value="all">All statuses</option><option value="present">Present</option><option value="absent">Absent</option><option value="on_leave">On leave</option><option value="not_marked">Not marked</option></select></div></div>
                <div className="overflow-x-auto rounded-xl border border-slate-200"><table className="w-full min-w-[640px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Day</th><th className="px-4 py-3">Meal</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Recorded</th><th className="px-4 py-3">Note</th></tr></thead><tbody className="divide-y divide-slate-100">{visibleHistory.map((record) => <tr className="hover:bg-slate-50" key={`${record.date}-${record.meal}`}><td className="px-4 py-3">{new Date(`${record.date}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</td><td className="px-4 py-3">{new Date(`${record.date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })}</td><td className="px-4 py-3 capitalize">{record.meal}</td><td className="px-4 py-3"><StatusPill status={record.status} /></td><td className="px-4 py-3">{new Date(record.markedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</td><td className="max-w-48 truncate px-4 py-3 text-slate-600">{record.note ?? "—"}</td></tr>)}{visibleHistory.length === 0 && <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={6}>No attendance records in this range.</td></tr>}</tbody></table></div>
                <div className="mt-3 flex items-center justify-between text-xs text-slate-500"><span>{historyRecords.length} recorded sessions</span><div className="flex items-center gap-2"><span>Page {historyPage} of {historyPageCount}</span><button aria-label="Previous history page" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40" disabled={historyPage <= 1} onClick={() => setHistoryPage((current) => current - 1)} type="button"><ChevronLeft size={15} /></button><button aria-label="Next history page" className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 disabled:opacity-40" disabled={historyPage >= historyPageCount} onClick={() => setHistoryPage((current) => current + 1)} type="button"><ChevronRight size={15} /></button></div></div>
              </section>
            </div>
          </section>
        )}

        {editingStudent && (
          <section aria-labelledby="edit-student-title" className="border-y border-slate-200 bg-white py-6 sm:rounded-xl sm:border sm:px-6">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div><h2 className="text-lg font-bold" id="edit-student-title">Edit {editingStudent.studentId}</h2><p className="mt-1 text-sm text-slate-500">Student ID and account role cannot be changed here.</p></div>
              <button aria-label="Close edit form" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-slate-100" onClick={() => setEditingStudent(null)} type="button"><X aria-hidden="true" size={18} /></button>
            </div>
            <form className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={saveStudent}>
              <label className="text-sm font-semibold">Full name<input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" maxLength={120} onChange={(event) => setEditForm({ ...editForm, fullName: event.target.value })} required value={editForm.fullName} /></label>
              <label className="text-sm font-semibold">Email<input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" maxLength={254} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} type="email" value={editForm.email} /></label>
              <label className="text-sm font-semibold">Phone<input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" maxLength={16} onChange={(event) => setEditForm({ ...editForm, phone: event.target.value })} type="tel" value={editForm.phone} /></label>
              <div className="flex items-end"><button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-60" disabled={mutatingId === editingStudent._id} type="submit"><Save aria-hidden="true" size={16} />Save changes</button></div>
            </form>
          </section>
        )}

        {subscriptionStudent && (
          <section aria-labelledby="subscription-title" className="border-y border-emerald-200 bg-white py-6 sm:rounded-xl sm:border sm:px-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div><h2 className="text-lg font-bold" id="subscription-title">Subscriptions · {subscriptionStudent.fullName}</h2><p className="mt-1 text-sm text-slate-500">End date is exclusive. No partial-month proration is calculated here.</p></div>
              <button aria-label="Close subscriptions" className="flex h-10 w-10 items-center justify-center rounded-lg hover:bg-slate-100" onClick={() => setSubscriptionStudent(null)} type="button"><X aria-hidden="true" size={18} /></button>
            </div>
            <form className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={createSubscription}>
              <label className="text-sm font-semibold">Meal plan
                <select className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" onChange={(event) => setSubscriptionPlan(event.target.value as typeof subscriptionPlan)} value={subscriptionPlan}>
                  <option value="afternoon">Afternoon · ₹1,500/month</option>
                  <option value="night">Night · ₹1,500/month</option>
                  <option value="both">Both meals · ₹3,000/month</option>
                </select>
              </label>
              <label className="text-sm font-semibold">Start date
                <input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" onChange={(event) => setSubscriptionStart(event.target.value)} required type="date" value={subscriptionStart} />
              </label>
              <label className="text-sm font-semibold">End date (exclusive)
                <input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" onChange={(event) => setSubscriptionEnd(event.target.value)} required type="date" value={subscriptionEnd} />
              </label>
              <div className="flex items-end"><button className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-60" disabled={isLoadingSubscriptions || subscriptionStudent.status !== "active"} type="submit"><CreditCard aria-hidden="true" size={16} />{isLoadingSubscriptions ? "Saving…" : "Add subscription"}</button></div>
            </form>
            {subscriptionError && <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">{subscriptionError}</p>}
            {isLoadingSubscriptions ? <p className="mt-5 text-sm text-slate-500" role="status">Loading subscription history…</p> : subscriptions.length === 0 ? <p className="mt-5 text-sm text-slate-500">No subscription history.</p> : (
              <ul className="mt-5 divide-y divide-slate-100 border-y border-slate-200">
                {subscriptions.map((subscription) => (
                  <li className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm" key={subscription._id}>
                    <span className="font-semibold capitalize">{subscription.plan} · {subscription.status}</span>
                    <span className="text-slate-600">{new Date(subscription.startDate).toISOString().slice(0, 10)} to {new Date(subscription.endDate).toISOString().slice(0, 10)} (end exclusive)</span>
                    <span className="font-bold">₹{(subscription.monthlyAmountPaise / 100).toLocaleString("en-IN")}/month</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {isCreating && (
          <section aria-labelledby="create-student-title" className="border-y border-emerald-200 bg-white py-6 sm:border sm:rounded-xl sm:px-6">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold" id="create-student-title">Create student account</h2>
                <p className="mt-1 text-sm text-slate-500">A student role and active account status are assigned automatically.</p>
              </div>
              <UserRoundPlus aria-hidden="true" className="text-emerald-800" size={22} />
            </div>
            <form className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" onSubmit={createStudent}>
              <label className="text-sm font-semibold">Student ID
                <input autoComplete="off" className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10" maxLength={32} onChange={(event) => setForm({ ...form, studentId: event.target.value })} required value={form.studentId} />
              </label>
              <label className="text-sm font-semibold">Full name
                <input autoComplete="name" className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10" maxLength={120} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required value={form.fullName} />
              </label>
              <label className="text-sm font-semibold">Email <span className="font-normal text-slate-500">(optional)</span>
                <input autoComplete="email" className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10" maxLength={254} onChange={(event) => setForm({ ...form, email: event.target.value })} type="email" value={form.email} />
              </label>
              <label className="text-sm font-semibold">Phone <span className="font-normal text-slate-500">(optional, international format)</span>
                <input autoComplete="tel" className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10" maxLength={16} onChange={(event) => setForm({ ...form, phone: event.target.value })} type="tel" value={form.phone} />
              </label>
              <label className="text-sm font-semibold">Temporary password
                <input autoComplete="new-password" className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10" maxLength={72} minLength={12} onChange={(event) => setForm({ ...form, password: event.target.value })} required type="password" value={form.password} />
              </label>
              <div className="flex items-end">
                <button className="min-h-11 w-full rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-60" disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Creating…" : "Create account"}
                </button>
              </div>
              {formError && <p className="sm:col-span-2 xl:col-span-3" role="alert"><span className="text-sm text-rose-800">{formError}</span></p>}
            </form>
          </section>
        )}

        <section aria-label="Student filters" className="flex flex-col gap-3 border-y border-slate-200 bg-white py-4 sm:flex-row sm:items-center sm:border sm:rounded-xl sm:px-4">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search students</span>
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input className="min-h-11 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10" maxLength={100} onChange={(event) => { setIsLoading(true); setError(""); setSearch(event.target.value); setPage(1); }} placeholder="Search name, ID, email or phone" value={search} />
          </label>
          <label className="sr-only" htmlFor="student-status">Filter by status</label>
          <select className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10" id="student-status" onChange={(event) => { setIsLoading(true); setError(""); setStatus(event.target.value as typeof status); setPage(1); }} value={status}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <label className="sr-only" htmlFor="attendance-filter">Filter by attendance</label>
          <select className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-700 focus:ring-4 focus:ring-indigo-700/10" id="attendance-filter" onChange={(event) => setAttendanceFilter(event.target.value as typeof attendanceFilter)} value={attendanceFilter}>
            <option value="all">All attendance</option><option value="present">Present</option><option value="absent">Absent</option><option value="on_leave">On leave</option><option value="not_marked">Not marked</option>
          </select>
        </section>

        <section aria-label="Student results" aria-live="polite">
          {isLoading ? (
            <div className="space-y-3" aria-label="Loading students">
              {[0, 1, 2].map((item) => <div className="h-[76px] animate-pulse rounded-lg bg-white" key={item} />)}
            </div>
          ) : error ? null : students.length === 0 ? (
            <div className="border-y border-slate-200 bg-white px-5 py-14 text-center sm:rounded-xl sm:border">
              <UserRoundPlus aria-hidden="true" className="mx-auto text-slate-400" size={28} />
              <h2 className="mt-3 font-bold">No students found</h2>
              <p className="mt-1 text-sm text-slate-500">Try another search or add a student account.</p>
            </div>
          ) : (
            <>
              {visibleStudents.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">No students match this attendance filter for today.</div> : <>
              <div className="space-y-3 md:hidden">
                {visibleStudents.map((student) => (
                <article className="cursor-pointer rounded-xl border border-emerald-100 bg-white px-4 py-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md" key={student._id} onClick={() => showStudentDetails(student)}>
                    <div className="flex items-start justify-between gap-3">
                      <button className="min-w-0 text-left" onClick={() => showStudentDetails(student)} type="button">
                        <p className="truncate font-bold">{student.fullName}</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">{student.studentId}</p>
                      </button>
                      <StudentStatus status={student.status} />
                    </div>
                    <p className="mt-3 break-words text-sm text-slate-600">{student.email ?? student.phone ?? "No contact details"}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-600">{attendanceDate}: {todaySummary?.byStudent[student._id] ? `Afternoon ${statusLabel(todaySummary.byStudent[student._id].afternoon ?? "not_marked")} · Night ${statusLabel(todaySummary.byStudent[student._id].night ?? "not_marked")}` : "No eligible meal sessions"}</p>
                    <div className="mt-3 flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()}>
                      <button className="min-h-10 rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-900 hover:bg-emerald-100" onClick={() => showStudentDetails(student)} type="button">View details</button>
                      <button className="min-h-10 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={() => beginEditing(student)} type="button">Edit</button>
                      {student.status === "active" && <button className="min-h-10 rounded-lg border border-emerald-200 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-50" onClick={() => void openSubscriptions(student)} type="button">Subscriptions</button>}
                    {student.status === "active" && <button className="mt-4 min-h-10 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-60" disabled={mutatingId === student._id} onClick={() => void deactivateStudent(student)} type="button">{mutatingId === student._id ? "Updating…" : "Deactivate"}</button>}
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white md:block">
                <table className="w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr><th className="px-5 py-3 font-bold">Student</th><th className="px-5 py-3 font-bold">Contact</th><th className="px-5 py-3 font-bold">Status</th><th className="px-5 py-3 text-right font-bold">Action</th></tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleStudents.map((student) => (
                      <tr className="cursor-pointer hover:bg-emerald-50/70" key={student._id} onClick={() => showStudentDetails(student)}>
                        <td className="px-5 py-4"><button className="text-left" onClick={() => showStudentDetails(student)} type="button"><p className="font-bold">{student.fullName}</p><p className="mt-1 text-xs text-slate-500">{student.studentId}</p></button></td>
                        <td className="px-5 py-4 text-slate-600">{student.email ?? student.phone ?? "No contact details"}<p className="mt-1 text-xs">{todaySummary?.byStudent[student._id] ? `Afternoon ${statusLabel(todaySummary.byStudent[student._id].afternoon ?? "not_marked")} · Night ${statusLabel(todaySummary.byStudent[student._id].night ?? "not_marked")}` : `No eligible sessions on ${attendanceDate}`}</p></td>
                        <td className="px-5 py-4"><StudentStatus status={student.status} /></td>
                        <td className="px-5 py-4 text-right" onClick={(event) => event.stopPropagation()}>
                          <div className="flex justify-end gap-2">
                            <button className="min-h-9 rounded-lg bg-emerald-50 px-3 text-xs font-bold text-emerald-900 hover:bg-emerald-100" onClick={() => showStudentDetails(student)} type="button">Details</button>
                            <button className="min-h-9 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 hover:bg-slate-50" onClick={() => beginEditing(student)} type="button">Edit</button>
                            {student.status === "active" && (
                              <>
                                <button className="min-h-9 rounded-lg border border-emerald-200 px-3 text-xs font-bold text-emerald-800 hover:bg-emerald-50" onClick={() => void openSubscriptions(student)} type="button">Subscriptions</button>
                                <button className="min-h-9 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-800 hover:bg-rose-50 disabled:opacity-60" disabled={mutatingId === student._id} onClick={() => void deactivateStudent(student)} type="button">{mutatingId === student._id ? "Updating..." : "Deactivate"}</button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>}
            </>
          )}
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <p>{pagination.total} {pagination.total === 1 ? "student" : "students"}</p>
          <div className="flex items-center gap-3">
            <span>Page {page} of {Math.max(pagination.totalPages, 1)}</span>
            <button aria-label="Previous page" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40" disabled={page <= 1 || isLoading} onClick={() => { setIsLoading(true); setPage((current) => current - 1); }} type="button"><ChevronLeft aria-hidden="true" size={18} /></button>
            <button aria-label="Next page" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40" disabled={page >= pagination.totalPages || isLoading} onClick={() => { setIsLoading(true); setPage((current) => current + 1); }} type="button"><ChevronRight aria-hidden="true" size={18} /></button>
          </div>
        </footer>
      </div>
    </main>
  );
}

function StudentStatus({ status }: { status: StudentSummary["status"] }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${status === "active" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${status === "active" ? "bg-emerald-600" : "bg-slate-400"}`} />
      {status === "active" ? "Active" : "Inactive"}
    </span>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#f6f7f3] px-4 py-3"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p><p className="mt-1 break-words text-sm font-semibold text-slate-800">{value}</p></div>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>;
}

function statusLabel(status: AttendanceStatus): string {
  return { present: "Present", absent: "Absent", on_leave: "On leave", not_marked: "Not marked" }[status];
}

function StatusPill({ status }: { status: AttendanceStatus }) {
  const style: Record<AttendanceStatus, string> = { present: "bg-emerald-100 text-emerald-800", absent: "bg-rose-100 text-rose-800", on_leave: "bg-amber-100 text-amber-900", not_marked: "bg-slate-100 text-slate-600" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${style[status]}`}>{statusLabel(status)}</span>;
}

function CompactStat({ label, value, tone = "neutral" }: { label: string; value: number | string; tone?: "neutral" | "green" | "red" | "indigo" }) {
  const colors = { neutral: "text-slate-900", green: "text-emerald-700", red: "text-rose-700", indigo: "text-indigo-800" };
  return <div className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-3"><p className={`text-xl font-extrabold tabular-nums ${colors[tone]}`}>{value}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{label}</p></div>;
}

function OverviewCard({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "indigo" | "green" | "red" | "neutral" }) {
  const styles = { indigo: "border-indigo-100 from-indigo-50/70", green: "border-emerald-100 from-emerald-50/70", red: "border-rose-100 from-rose-50/70", neutral: "border-slate-200 from-white" };
  const values = { indigo: "text-indigo-950", green: "text-emerald-800", red: "text-rose-800", neutral: "text-slate-900" };
  return <article className={`rounded-2xl border bg-gradient-to-br ${styles[tone]} to-white p-4 shadow-sm sm:p-5`}><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className={`mt-2 text-2xl font-extrabold tabular-nums ${values[tone]}`}>{value}</p><p className="mt-1 text-[11px] leading-4 text-slate-500">{detail}</p></article>;
}

function AttendanceCalendar({ month, records, holidays, selectedDate, onSelectDate }: { month: string; records: StudentAttendanceRecord[]; holidays: StudentHoliday[]; selectedDate: string; onSelectDate: (date: string) => void }) {
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber) return <p className="py-8 text-center text-sm text-slate-500">Choose a month to view attendance.</p>;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const firstDay = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const byDate = new Map<string, StudentAttendanceRecord[]>();
  for (const record of records) byDate.set(record.date, [...(byDate.get(record.date) ?? []), record]);
  const holidaysByDate = new Map(holidays.map((holiday) => [holiday.serviceDate.slice(0, 10), holiday]));
  const statusStyle: Record<AttendanceStatus, string> = {
    present: "bg-emerald-100 text-emerald-800",
    absent: "bg-rose-100 text-rose-800",
    on_leave: "bg-amber-100 text-amber-900",
    not_marked: "bg-slate-100 text-slate-500",
  };
  const label: Record<AttendanceStatus, string> = { present: "Present", absent: "Absent", on_leave: "Leave", not_marked: "Not marked" };
  return <div className="overflow-hidden rounded-xl border border-slate-200">
    <div className="grid grid-cols-7 bg-slate-50 text-center text-[10px] font-bold uppercase tracking-wide text-slate-500 sm:text-[11px]">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div className="py-2.5" key={day}>{day}</div>)}</div>
    <div aria-label={`${new Date(Date.UTC(year, monthNumber - 1)).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })} attendance`} className="grid grid-cols-7 gap-px bg-slate-200">
      {Array.from({ length: firstDay }, (_, index) => <div aria-hidden="true" className="min-h-[82px] bg-white" key={`empty-${index}`} />)}
      {Array.from({ length: daysInMonth }, (_, index) => {
        const day = index + 1;
        const key = `${month}-${String(day).padStart(2, "0")}`;
        const dayRecords = byDate.get(key) ?? [];
        const holiday = holidaysByDate.get(key);
        const future = key > currentIndiaDate();
        const selected = selectedDate === key;
        return <button aria-label={`${key}${holiday ? `, holiday: ${holiday.reason}` : ""}. Select date attendance`} aria-pressed={selected} className={`min-h-[76px] min-w-0 p-1 text-left transition sm:min-h-[92px] sm:p-2 ${selected ? "relative z-10 bg-indigo-50 ring-2 ring-inset ring-indigo-600" : holiday ? "bg-slate-100 hover:bg-slate-200" : future ? "bg-slate-50 text-slate-400 hover:bg-slate-100" : "bg-white hover:bg-indigo-50/50"}`} key={key} onClick={() => onSelectDate(key)} type="button">
          <p className={`text-xs font-bold ${selected ? "text-indigo-800" : future ? "text-slate-400" : "text-slate-700"}`}>{day}</p>
          {holiday && <p className="mt-1 truncate rounded bg-slate-200 px-1 py-0.5 text-[9px] font-bold text-slate-700" title={holiday.reason}>Holiday</p>}
          <div className="mt-1 space-y-1">
            {(["afternoon", "night"] as const).map((meal) => {
              const record = dayRecords.find((item) => item.meal === meal);
              const unrecordedText = future ? "Future" : holiday ? "Holiday" : "Not marked";
              const unrecordedTone = future ? "bg-transparent text-slate-400" : holiday ? "bg-slate-200 text-slate-600" : "bg-slate-50 text-slate-400";
              const compactLabel = record ? ({ present: "P", absent: "A", on_leave: "L", not_marked: "·" } as const)[record.status] : future ? "F" : holiday ? "H" : "·";
              return <div className={`truncate rounded px-0.5 py-0.5 text-[9px] font-semibold sm:px-1 sm:text-[10px] ${record ? statusStyle[record.status] : unrecordedTone}`} key={meal} title={`${meal === "afternoon" ? "Afternoon" : "Night"}: ${record ? label[record.status] : unrecordedText}`}>
                {meal === "afternoon" ? "Af" : "N"} · {compactLabel}
              </div>;
            })}
          </div>
        </button>;
      })}
    </div>
  </div>;
}
