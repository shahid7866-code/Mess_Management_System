import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import AttendanceClient from "./AttendanceClient";

export default function AttendancePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f2f5f2] text-sm font-medium text-emerald-900" role="status">
          Loading attendance…
        </main>
      }
    >
      <AdminAttendancePage />
    </Suspense>
  );
}

async function AdminAttendancePage() {
  const student = await getCurrentSession();
  if (!student) redirect("/login");
  if (student.role !== "admin") redirect("/portal");

  return <AttendanceClient />;
}
