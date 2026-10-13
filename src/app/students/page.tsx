import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import StudentsClient from "./StudentsClient";

export default function StudentsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f2f5f2] text-sm font-medium text-emerald-900" role="status">
          Loading students…
        </main>
      }
    >
      <AdminStudentsPage />
    </Suspense>
  );
}

async function AdminStudentsPage() {
  const student = await getCurrentSession();
  if (!student) redirect("/login");
  if (student.role !== "admin") redirect("/portal");

  return <StudentsClient />;
}
