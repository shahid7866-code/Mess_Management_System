"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";

export default function SignOutButton() {
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setIsSigningOut(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", cache: "no-store" });
      if (!response.ok) throw new Error("Logout could not be completed. Please try again.");
      // A full navigation clears in-memory portal state and the App Router cache.
      window.location.replace("/login");
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Logout could not be completed. Please try again.");
    } finally {
      setIsSigningOut(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
    <button
      aria-label="Sign out"
      className="ml-auto flex min-h-10 min-w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-rose-50 hover:text-rose-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700 disabled:opacity-50"
      disabled={isSigningOut}
      onClick={signOut}
      title="Sign out"
      type="button"
    >
      <LogOut aria-hidden="true" size={18} /><span className="sr-only">Sign out</span>
    </button>
    {error && <span className="max-w-48 text-right text-xs text-rose-700" role="alert">{error}</span>}
    </div>
  );
}
