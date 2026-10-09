"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useSyncExternalStore } from "react";
import { getAuthServerSnapshot, getCurrentUserSnapshot, subscribeToStorage } from "@/lib/auth-store";
import { safeNextPath } from "@/lib/safeNextPath";
import { useAuthForm } from "@/lib/useAuthForm";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const next = safeNextPath(searchParams.get("next"));
  // A login just submitted from this form already navigates to `next` itself
  // (below) - without this flag, writeAuth's storage-sync event flips
  // currentUser true on the next render, which re-fires the
  // already-authenticated effect and its hardcoded /account replace races
  // the push to `next` (and reliably wins, since it fires after), silently
  // discarding ?next=/cart (or any other destination) in favor of /account.
  const justSubmittedRef = useRef(false);
  const { email, setEmail, password, setPassword, error, loading, submit } = useAuthForm("login", () => {
    justSubmittedRef.current = true;
    router.push(next);
  });

  useEffect(() => {
    if (currentUser && !justSubmittedRef.current) router.replace("/account");
  }, [currentUser, router]);

  if (currentUser) return null;

  return (
    <main className="page-shell">
      <Link href="/" className="back-link">← Back home</Link>
      <h1>Welcome back.</h1>
      <form
        className="auth-modal"
        style={{ margin: 0, width: "100%", boxShadow: "none", padding: 0 }}
        onSubmit={(event) => { event.preventDefault(); submit(); }}
      >
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" />
        <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-submit interactive" type="submit" disabled={loading}>
          {loading && <span className="spinner" />}
          {loading ? "Signing in..." : "Log in"}
        </button>
        <Link href={`/register${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`} className="auth-switch">
          Need an account? Sign up
        </Link>
      </form>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
