"use client";

import Link from "next/link";
import { useState, type KeyboardEvent } from "react";
import { extractErrorMessage, writeAuth } from "@/lib/auth-store";
import { API_BASE, Avatar, IconEye, IconEyeOff, ghostButtonClass, inputClass, primaryButtonClass, focusRing } from "./ui";

const CAPABILITIES = ["Fulfil and track orders", "Manage products and stock", "Control roles and access"];

export function AdminLogin({ sessionNotice }: { sessionNotice?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(extractErrorMessage(data, "Login failed."));
        return;
      }
      writeAuth(data.access_token, data.user.username, data.user.role ?? "customer");
      setPassword("");
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  const trackCapsLock = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState("CapsLock"));

  return (
    <main className="flex min-h-screen bg-slate-50">
      <aside className="hidden w-5/12 max-w-md flex-col justify-between bg-indigo-700 p-10 text-white md:flex">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 font-semibold">T</span>
          <span className="text-lg font-semibold">Thread&amp;Co Admin</span>
        </div>
        <ul className="space-y-3 text-sm text-indigo-100">
          {CAPABILITIES.map((line) => (
            <li key={line} className="flex items-center gap-2">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-indigo-300" />
              {line}
            </li>
          ))}
        </ul>
        <p className="text-xs text-indigo-200">Authorised staff only. Actions are logged.</p>
      </aside>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <form
          className="w-full max-w-sm space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600 font-semibold text-white md:hidden">T</div>
            <p role="heading" aria-level={1} className="pt-2 text-2xl font-semibold text-slate-900 md:pt-0">Admin sign in</p>
            <p className="text-sm text-slate-500">Use your administrator account.</p>
          </div>

          {sessionNotice && !error && (
            <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {sessionNotice}
            </p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="admin-email" className="block text-sm font-medium text-slate-700">Email address</label>
            <input
              id="admin-email"
              type="email"
              required
              autoFocus
              autoComplete="email"
              placeholder="you@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className={inputClass}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="admin-password" className="block text-sm font-medium text-slate-700">Password</label>
              <Link href="/forgot-password" className={`rounded text-sm text-indigo-600 hover:underline ${focusRing}`}>
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="admin-password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyUp={trackCapsLock}
                onKeyDown={trackCapsLock}
                aria-describedby={error ? "admin-login-error" : undefined}
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className={`absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 hover:text-slate-900 ${focusRing}`}
              >
                {showPassword ? <IconEyeOff className="h-4 w-4" /> : <IconEye className="h-4 w-4" />}
              </button>
            </div>
            {capsLock && <p className="text-xs text-amber-700">Caps Lock is on.</p>}
          </div>

          {error && (
            <p id="admin-login-error" role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className={`${primaryButtonClass} w-full`}>
            {loading && (
              <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white motion-reduce:animate-none" />
            )}
            {loading ? "Signing in…" : "Sign in"}
          </button>

          <Link href="/" className={`block text-center text-sm text-slate-500 hover:text-slate-900 ${focusRing}`}>
            ← Back to store
          </Link>
        </form>
      </div>
    </main>
  );
}

export function AccessDenied({ username, role, onSwitch }: { username: string; role: string; onSwitch: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="flex justify-center">
          <Avatar name={username} />
        </div>
        <div className="space-y-1">
          <p role="heading" aria-level={1} className="text-lg font-semibold text-slate-900">No admin access</p>
          <p className="text-sm text-slate-600">
            Signed in as <span className="font-medium">{username}</span> ({role || "customer"}). This account can&apos;t open the admin console.
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <button type="button" onClick={onSwitch} className={primaryButtonClass}>Switch account</button>
          <Link href="/" className={ghostButtonClass}>Go to store</Link>
        </div>
      </div>
    </main>
  );
}
