"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, CheckCircle2, Eye, EyeOff, Sparkles, UserRoundPlus } from "lucide-react";

interface RegisterResponse {
  ok: boolean;
  data?: {
    studentId: string;
    fullName: string;
  };
  error?: { message?: string };
}

export default function StudentRegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: "",
    studentId: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");
    setSuccessMessage("");

    if (form.password.length < 12) {
      setErrorMessage("Password must be at least 12 characters long.");
      return;
    }

    if (form.password !== form.confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch("/api/student/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          studentId: form.studentId,
          email: form.email || undefined,
          phone: form.phone || undefined,
          password: form.password,
          confirmPassword: form.confirmPassword,
        }),
      });
      const result = (await response.json()) as RegisterResponse;

      if (!response.ok || !result.ok || !result.data) {
        setErrorMessage(result.error?.message ?? "Unable to create your student account.");
        return;
      }

      setSuccessMessage(`Account created for ${result.data.studentId}. Redirecting to sign in…`);
      setTimeout(() => {
        router.replace("/student/login");
      }, 900);
    } catch {
      setErrorMessage("A connection error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f4f7f4] px-4 py-8 text-slate-900 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl overflow-hidden rounded-[30px] border border-emerald-100 bg-white shadow-[0_30px_80px_rgba(15,23,42,0.08)]">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr]">
          <section className="relative overflow-hidden bg-gradient-to-br from-[#0d4b3d] via-[#0f5a49] to-[#eafef4] px-6 py-8 text-white sm:px-8 lg:px-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.16),_transparent_25%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.25),_transparent_35%)]" aria-hidden="true" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white/10 ring-1 ring-white/20">
                  <Sparkles className="h-6 w-6 text-emerald-100" />
                </div>
                <div>
                  <div className="text-2xl font-black tracking-tight">Abhishek Mess</div>
                  <div className="text-[10px] font-bold tracking-[0.22em] text-emerald-100">SMART MESS MANAGEMENT</div>
                </div>
              </div>

              <div className="py-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-100">
                  Create account
                </div>
                <h1 className="mt-6 text-4xl font-black leading-tight sm:text-5xl">Join your mess community.</h1>
                <p className="mt-4 max-w-md text-base leading-7 text-emerald-50/80">
                  Register for your student account to view meal plans, attendance records, subscription activity, and payment details.
                </p>
              </div>

              <div className="rounded-2xl border border-white/15 bg-white/5 p-4 text-sm text-emerald-50/80">
                Your account is created as a student automatically. Access is protected by server-side verification and secure password hashing.
              </div>
            </div>
          </section>

          <section className="flex items-center justify-center px-5 py-8 sm:px-8 lg:px-10">
            <div className="w-full max-w-lg">
              <div className="mb-8 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">Student Portal</p>
                  <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-900">Register</h2>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-800">
                  <UserRoundPlus className="h-5 w-5" />
                </div>
              </div>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="register-full-name">Full name</label>
                  <input autoComplete="name" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10" id="register-full-name" maxLength={120} onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))} required value={form.fullName} />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="register-student-id">Student ID / registration number</label>
                  <input autoComplete="off" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10" id="register-student-id" maxLength={32} onChange={(event) => setForm((current) => ({ ...current, studentId: event.target.value }))} required value={form.studentId} />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="register-email">Email address</label>
                    <input autoComplete="email" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10" id="register-email" maxLength={254} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} type="email" value={form.email} />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="register-phone">Phone number</label>
                    <input autoComplete="tel" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10" id="register-phone" maxLength={16} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} type="tel" value={form.phone} />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="register-password">Password</label>
                    <div className="relative">
                      <input autoComplete="new-password" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 pr-12 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10" id="register-password" maxLength={72} minLength={12} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} required type={showPassword ? "text" : "password"} value={form.password} />
                      <button aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 hover:text-slate-900" onClick={() => setShowPassword((visible) => !visible)} type="button">
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-semibold text-slate-700" htmlFor="register-confirm-password">Confirm password</label>
                    <div className="relative">
                      <input autoComplete="new-password" className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3.5 pr-12 text-base outline-none transition placeholder:text-slate-400 focus:border-emerald-700 focus:ring-4 focus:ring-emerald-700/10" id="register-confirm-password" maxLength={72} minLength={12} onChange={(event) => setForm((current) => ({ ...current, confirmPassword: event.target.value }))} required type={showConfirmPassword ? "text" : "password"} value={form.confirmPassword} />
                      <button aria-label={showConfirmPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 hover:text-slate-900" onClick={() => setShowConfirmPassword((visible) => !visible)} type="button">
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>

                {errorMessage && (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-sm text-rose-800" role="alert">{errorMessage}</p>
                )}

                {successMessage && (
                  <p className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-900" role="status"><CheckCircle2 className="h-4 w-4" /> {successMessage}</p>
                )}

                <button className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-800 px-4 text-sm font-bold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSubmitting} type="submit">
                  {isSubmitting ? "Creating account…" : "Create student account"}
                  {!isSubmitting && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>

              <p className="mt-6 text-sm text-slate-600">Already have an account? <Link className="font-semibold text-emerald-800 hover:underline" href="/student/login">Student Login</Link></p>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
