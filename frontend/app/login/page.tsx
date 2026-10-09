"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useSyncExternalStore } from "react";
import { getAuthServerSnapshot, getCurrentUserSnapshot, subscribeToStorage } from "@/lib/auth-store";
import { useAuthForm } from "@/lib/useAuthForm";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const next = searchParams.get("next") || "/account";
  const { email, setEmail, password, setPassword, error, loading, submit } = useAuthForm("login", () => router.push(next));

  useEffect(() => {
    if (currentUser) router.replace("/account");
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
