"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useSyncExternalStore } from "react";
import { getAuthServerSnapshot, getCurrentUserSnapshot, subscribeToStorage } from "@/lib/auth-store";
import { safeNextPath } from "@/lib/safeNextPath";
import { useAuthForm } from "@/lib/useAuthForm";

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const next = safeNextPath(searchParams.get("next"));
  const { name, setName, email, setEmail, password, setPassword, error, loading, submit } = useAuthForm("register", () => router.push(next));

  useEffect(() => {
    if (currentUser) router.replace("/account");
  }, [currentUser, router]);

  if (currentUser) return null;

  return (
    <main className="page-shell">
      <Link href="/" className="back-link">← Back home</Link>
      <h1>Create your account.</h1>
      <form
        className="auth-modal"
        style={{ margin: 0, width: "100%", boxShadow: "none", padding: 0 }}
        onSubmit={(event) => { event.preventDefault(); submit(); }}
      >
        <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" />
        <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" />
        <input type="password" required minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password (min 8 characters)" />
        {error && <p className="auth-error">{error}</p>}
        <button className="auth-submit interactive" type="submit" disabled={loading}>
          {loading && <span className="spinner" />}
          {loading ? "Creating account..." : "Create account"}
        </button>
        <Link href={`/login${next !== "/account" ? `?next=${encodeURIComponent(next)}` : ""}`} className="auth-switch">
          Already have an account? Log in
        </Link>
      </form>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={null}>
      <RegisterPageContent />
    </Suspense>
  );
}
