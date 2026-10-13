import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import StudentPortalClient from "./StudentPortalClient";

export default function StudentPortalPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f2f5f2] text-sm font-medium text-emerald-900" role="status">
          Loading your portal…
        </main>
      }
    >
      <AuthenticatedStudentPortal />
    </Suspense>
  );
}

async function AuthenticatedStudentPortal() {
  const student = await getCurrentSession();
  if (!student) redirect("/login");
  if (student.role !== "student") redirect("/admin/dashboard");

  return <StudentPortalClient />;
}
