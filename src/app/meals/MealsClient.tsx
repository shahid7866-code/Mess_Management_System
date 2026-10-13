"use client";

import { useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Check, Clock3, Save } from "lucide-react";

type Meal = "afternoon" | "night";

interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { message: string };
}

interface Schedule {
  meal: Meal;
  openingTime: string;
  closingTime: string;
  timezone: string;
}

interface Holiday {
  _id: string;
  serviceDate: string;
  reason: string;
  attendanceExceptionAllowed: boolean;
  exceptionReason?: string;
}

function indiaDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export default function MealsClient() {
  const [date, setDate] = useState(indiaDate);
  const [afternoonText, setAfternoonText] = useState("");
  const [nightText, setNightText] = useState("");
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [holidayReason, setHolidayReason] = useState("");
  const [attendanceExceptionAllowed, setAttendanceExceptionAllowed] = useState(false);
  const [exceptionReason, setExceptionReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState<Meal | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(`/api/menus?date=${date}`, { signal: controller.signal }).then((response) => response.json()),
      fetch("/api/meal-schedules", { signal: controller.signal }).then((response) => response.json()),
      fetch(`/api/holidays?from=${date}&to=${date}`, { signal: controller.signal }).then((response) => response.json()),
    ])
      .then(([menuResult, scheduleResult, holidayResult]) => {
        if (!menuResult.ok || !scheduleResult.ok || !holidayResult.ok) {
          throw new Error("Could not load meal settings");
        }
        setAfternoonText(menuResult.data.menu?.afternoonItems.join("\n") ?? "");
        setNightText(menuResult.data.menu?.nightItems.join("\n") ?? "");
        setSchedules(scheduleResult.data.schedules);
        setHolidays(holidayResult.data.holidays);
      })
      .catch((loadError: unknown) => {
        if (loadError instanceof Error && loadError.name !== "AbortError") setError(loadError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [date, refreshKey]);

  async function saveMenu(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/menus", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceDate: date,
          afternoonItems: afternoonText.split("\n").map((item) => item.trim()).filter(Boolean),
          nightItems: nightText.split("\n").map((item) => item.trim()).filter(Boolean),
        }),
      });
      const result = (await response.json()) as ApiEnvelope<unknown>;
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "Could not save menu");
      setNotice("Daily menu saved.");
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not save menu");
    } finally {
      setSaving(false);
    }
  }

  async function saveSchedule(meal: Meal) {
    const schedule = schedules.find((item) => item.meal === meal);
    if (!schedule) return;
    setSavingSchedule(meal);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/meal-schedules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(schedule),
      });
      const result = (await response.json()) as ApiEnvelope<unknown>;
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "Could not save schedule");
      setNotice(`${meal === "afternoon" ? "Afternoon" : "Night"} schedule saved.`);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not save schedule");
    } finally {
      setSavingSchedule(null);
    }
  }

  async function addHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceDate: date,
          reason: holidayReason,
          attendanceExceptionAllowed,
          exceptionReason: attendanceExceptionAllowed ? exceptionReason : undefined,
        }),
      });
      const result = (await response.json()) as ApiEnvelope<unknown>;
      if (!response.ok || !result.ok) throw new Error(result.error?.message ?? "Could not add holiday");
      setHolidayReason("");
      setExceptionReason("");
      setNotice("Mess holiday recorded. Attendance rules updated.");
      setLoading(true);
      setRefreshKey((current) => current + 1);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Could not add holiday");
    } finally {
      setSaving(false);
    }
  }

  function updateSchedule(meal: Meal, field: "openingTime" | "closingTime", value: string) {
    setSchedules((current) => current.map((schedule) =>
      schedule.meal === meal ? { ...schedule, [field]: value } : schedule,
    ));
  }

  const holidayAlreadyExists = holidays.some((holiday) => holiday.serviceDate.startsWith(date));

  return (
    <main className="min-h-screen bg-[#f3f6f3] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-[76px] max-w-7xl items-center justify-between gap-4 px-4 sm:px-8">
          <div><p className="text-xs font-semibold text-emerald-800">ABHISHEK MESS / ADMIN</p><h1 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Meals &amp; service</h1></div>
          <label className="text-sm font-semibold">Service date<input className="ml-2 min-h-10 rounded-lg border border-slate-300 px-2 text-sm focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" onChange={(event) => { setLoading(true); setError(""); setDate(event.target.value); }} type="date" value={date} /></label>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-5 px-4 py-6 sm:px-8 sm:py-8">
        {notice && <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900" role="status">{notice}</p>}
        {error && <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900" role="alert">{error}</p>}

        {loading ? <div className="h-48 animate-pulse rounded-xl bg-white" role="status" aria-label="Loading meal settings" /> : (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.4fr)_minmax(320px,0.8fr)]">
            <div className="space-y-5">
              <section className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-6">
                <div className="flex items-center gap-2"><CalendarDays aria-hidden="true" className="text-emerald-800" size={19} /><h2 className="font-bold">Daily menu</h2></div>
                <form className="mt-5 space-y-4" onSubmit={saveMenu}>
                  <label className="block text-sm font-semibold">Afternoon menu <span className="font-normal text-slate-500">(one item per line)</span>
                    <textarea className="mt-2 min-h-28 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" maxLength={3100} onChange={(event) => setAfternoonText(event.target.value)} placeholder={"Roti\nDal\nRice\nSeasonal vegetables"} value={afternoonText} />
                  </label>
                  <label className="block text-sm font-semibold">Night menu <span className="font-normal text-slate-500">(one item per line)</span>
                    <textarea className="mt-2 min-h-28 w-full resize-y rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" maxLength={3100} onChange={(event) => setNightText(event.target.value)} placeholder={"Roti\nRice\nDal\nSeasonal vegetables"} value={nightText} />
                  </label>
                  <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-800 px-4 text-sm font-bold text-white hover:bg-emerald-900 disabled:opacity-60" disabled={saving} type="submit"><Save aria-hidden="true" size={16} />{saving ? "Saving…" : "Save daily menu"}</button>
                </form>
              </section>

              <section className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-6">
                <div className="flex items-center gap-2"><Clock3 aria-hidden="true" className="text-emerald-800" size={19} /><h2 className="font-bold">Attendance windows</h2></div>
                <p className="mt-1 text-sm text-slate-500">Times use Asia/Kolkata. The closing time is exclusive.</p>
                <div className="mt-4 divide-y divide-slate-100">
                  {(["afternoon", "night"] as const).map((meal) => {
                    const schedule = schedules.find((item) => item.meal === meal);
                    if (!schedule) return null;
                    return (
                      <div className="grid gap-3 py-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end" key={meal}>
                        <p className="text-sm font-bold capitalize sm:pb-3">{meal}</p>
                        <label className="text-xs font-semibold text-slate-600">Opens<input className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" onChange={(event) => updateSchedule(meal, "openingTime", event.target.value)} type="time" value={schedule.openingTime} /></label>
                        <label className="text-xs font-semibold text-slate-600">Closes<input className="mt-1.5 min-h-10 w-full rounded-lg border border-slate-300 px-2 text-sm" onChange={(event) => updateSchedule(meal, "closingTime", event.target.value)} type="time" value={schedule.closingTime} /></label>
                        <button className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-emerald-200 px-3 text-xs font-bold text-emerald-900 hover:bg-emerald-50 disabled:opacity-60" disabled={savingSchedule === meal} onClick={() => void saveSchedule(meal)} type="button"><Check aria-hidden="true" size={15} />{savingSchedule === meal ? "Saving…" : "Save"}</button>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <section className="border-y border-slate-200 bg-white py-5 sm:rounded-xl sm:border sm:px-6">
              <div className="flex items-center gap-2"><CalendarDays aria-hidden="true" className="text-emerald-800" size={19} /><h2 className="font-bold">Mess holidays</h2></div>
              <form className="mt-5 space-y-4" onSubmit={addHoliday}>
                <label className="block text-sm font-semibold">Reason
                  <input className="mt-2 min-h-11 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" maxLength={240} minLength={2} onChange={(event) => setHolidayReason(event.target.value)} required value={holidayReason} />
                </label>
                <label className="flex min-h-11 items-center gap-3 text-sm font-semibold"><input checked={attendanceExceptionAllowed} className="h-4 w-4 accent-emerald-800" onChange={(event) => setAttendanceExceptionAllowed(event.target.checked)} type="checkbox" />Allow authorized attendance exception</label>
                {attendanceExceptionAllowed && <label className="block text-sm font-semibold">Exception reason
                  <textarea className="mt-2 min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-700/10" maxLength={240} minLength={8} onChange={(event) => setExceptionReason(event.target.value)} required value={exceptionReason} />
                </label>}
                <button className="min-h-11 w-full rounded-lg border border-rose-200 px-4 text-sm font-bold text-rose-900 hover:bg-rose-50 disabled:opacity-60" disabled={saving || holidayAlreadyExists} type="submit">{holidayAlreadyExists ? "Holiday already recorded" : saving ? "Saving…" : `Declare ${date} a holiday`}</button>
              </form>
              <div className="mt-6 border-t border-slate-200 pt-4">
                <h3 className="text-sm font-bold">Holiday for selected date</h3>
                {holidays.length === 0 ? <p className="mt-2 text-sm text-slate-500">No holiday recorded.</p> : holidays.map((holiday) => <article className="mt-3 rounded-lg bg-rose-50 px-3 py-3 text-sm" key={holiday._id}><p className="font-bold text-rose-900">{holiday.reason}</p><p className="mt-1 text-xs text-rose-800">{holiday.attendanceExceptionAllowed ? `Attendance exception: ${holiday.exceptionReason}` : "Attendance blocked"}</p></article>)}
              </div>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}