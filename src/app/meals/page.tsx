import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import MealsClient from "./MealsClient";

export default function MealsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f2f5f2] text-sm font-medium text-emerald-900" role="status">
          Loading meal management…
        </main>
      }
    >
      <AdminMealsPage />
    </Suspense>
  );
}

async function AdminMealsPage() {
  const student = await getCurrentSession();
  if (!student) redirect("/login");
  if (student.role !== "admin") redirect("/portal");

  return <MealsClient />;
}
