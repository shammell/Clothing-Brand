"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { extractErrorMessage } from "@/lib/auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Captured once, from the URL this page first loaded with - not re-read
  // from searchParams on every render, because the token is then scrubbed
  // out of the URL below and must not disappear from this component too.
  const [token] = useState(() => searchParams.get("token") ?? "");
  // Left in the address bar, the token lingers in browser history, can be
  // read back via the Referer header by anything else the page loads, and
  // gets swept up by page-view analytics (this app loads Vercel Analytics
  // on every page). None of those should ever see it.
  useEffect(() => {
    if (token) router.replace("/reset-password");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(extractErrorMessage(data, "Could not reset your password."));
        return;
      }
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return <p>This reset link is missing its token. Request a new one from the <Link href="/forgot-password">forgot password</Link> page.</p>;
  }

  if (done) {
    return <p>Password updated. Redirecting to login…</p>;
  }

  return (
    <form
      className="auth-modal"
      style={{ margin: 0, width: "100%", boxShadow: "none", padding: 0 }}
      onSubmit={handleSubmit}
    >
      <input
        type="password"
        required
        minLength={8}
        value={newPassword}
        onChange={(event) => setNewPassword(event.target.value)}
        placeholder="New password"
      />
      {error && <p className="auth-error">{error}</p>}
      <button className="auth-submit interactive" type="submit" disabled={loading}>
        {loading ? "Saving..." : "Set new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="page-shell">
      <Link href="/login" className="back-link">← Back to login</Link>
      <h1>Choose a new password.</h1>
      <Suspense fallback={null}>
        <ResetPasswordContent />
      </Suspense>
    </main>
  );
}
