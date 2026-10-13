"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from "lucide-react";
import Image from "next/image";

interface SessionResponse {
  ok: boolean;
  data?: { student: { role: "admin" | "student" } | null };
  error?: { message?: string };
}

export default function AdminLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    fetch("/api/auth/session")
      .then(async (response) => {
        const result = (await response.json()) as SessionResponse;
        if (!active) return;
        if (result.ok && result.data?.student) {
          router.replace(result.data.student.role === "admin" ? "/admin/dashboard" : "/portal");
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, [router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password }),
      });
      const result = (await response.json()) as {
        ok: boolean;
        data?: { student: { role: "admin" | "student" } };
        error?: { message?: string };
      };

      if (!response.ok || !result.ok || !result.data) {
        setErrorMessage(result.error?.message ?? "Unable to sign in. Please try again.");
        return;
      }

      router.replace(result.data.student.role === "admin" ? "/admin/dashboard" : "/portal");
      router.refresh();
    } catch {
      setErrorMessage("A connection error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7f4] px-4 py-10 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl overflow-hidden rounded-[30px] border border-emerald-100 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.08)]">
        <div className="grid min-h-[780px] lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative overflow-hidden bg-gradient-to-br from-[#0d4b3d] via-[#0c5a47] to-[#1a7a5f] px-6 py-8 text-white sm:px-8 lg:px-10 lg:py-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.18),_transparent_30%),radial-gradient(circle_at_bottom_left,_rgba(16,185,129,0.22),_transparent_35%)]" aria-hidden="true" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/20">
                  <Image src="/abhishek-mess-icon.svg" alt="Abhishek Mess" width={40} height={40} className="h-9 w-9 object-contain" />
                </div>
                <div>
                  <div className="text-2xl font-black tracking-tight">Abhishek Mess</div>
                  <div className="text-[10px] font-bold tracking-[0.22em] text-emerald-100">SMART MESS MANAGEMENT</div>
                </div>
              </div>

              <div className="max-w-md py-10">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Secure admin access
                </div>
                <h1 className="mt-6 text-4xl font-black leading-tight sm:text-5xl">Manage your mess with confidence.</h1>
                <p className="mt-4 text-base leading-7 text-emerald-50/80">
                  Keep track of students, meals, attendance, subscriptions, payments, and operational reporting from a single admin workspace.
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/5 p-4 text-sm text-emerald-50/80">
                Public admin registration is disabled for security. Secure onboarding remains under existing administrator controls.
              </div>
            </div>
          </section>

          <section className="flex items-center justify-center px-5 py-8 sm:px-8 lg:px-12">
            <div className="w-full max-w-md">
              <div className="mb-8 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Admin Portal</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Sign in</h2>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                  <LockKeyhole className="h-5 w-5" />
                </div>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="admin-identifier">Student ID or email</label>
                  <input
                    autoComplete="username"
                    className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10"
                    id="admin-identifier"
                    maxLength={160}
                    onChange={(event) => setIdentifier(event.target.value)}
                    placeholder="ADMIN001"
                    required
                    value={identifier}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="admin-password">Password</label>
                  <div className="relative">
                    <input
                      autoComplete="current-password"
                      className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 pr-12 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10"
                      id="admin-password"
                      maxLength={72}
                      onChange={(event) => setPassword(event.target.value)}
                      placeholder="Enter your password"
                      required
                      type={showPassword ? "text" : "password"}
                      value={password}
                    />
                    <button aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 hover:text-slate-900" onClick={() => setShowPassword((visible) => !visible)} type="button">
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                </div>

                {errorMessage && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800" role="alert">{errorMessage}</p>
                )}

                <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Signing in…" : "Admin Login"}
                  {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>

              <div className="mt-8 border-t border-slate-200 pt-5 text-sm text-slate-600">
                <p className="leading-6">Need another admin account? Use the secure onboarding path already managed by the current administrator.</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <Link className="font-semibold text-emerald-800 hover:underline" href="/">Back to home</Link>
                  <Link className="font-semibold text-slate-700 hover:text-emerald-800" href="/student/login">Student login</Link>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
