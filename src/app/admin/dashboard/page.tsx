import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard-service";
import DashboardClient from "@/app/DashboardClient";

export default function AdminDashboardPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[#f2f5f2] text-sm font-medium text-emerald-900" role="status">
          Loading dashboard…
        </main>
      }
    >
      <AuthenticatedAdminDashboard />
    </Suspense>
  );
}

async function AuthenticatedAdminDashboard() {
  const student = await getCurrentSession();

  if (!student) {
    redirect("/login");
  }

  if (student.role !== "admin") {
    redirect("/portal");
  }

  const dashboardData = await getDashboardData(student.fullName);
  return <DashboardClient data={dashboardData} />;
}
