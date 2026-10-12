"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    try {
      await fetch(`${API_BASE}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
    } finally {
      setLoading(false);
      setSubmitted(true);
    }
  };

  return (
    <main className="page-shell">
      <Link href="/login" className="back-link">← Back to login</Link>
      <h1>Reset your password.</h1>
      {submitted ? (
        <p>If that email is registered, a reset link is on its way. Check your inbox.</p>
      ) : (
        <form
          className="auth-modal"
          style={{ margin: 0, width: "100%", boxShadow: "none", padding: 0 }}
          onSubmit={handleSubmit}
        >
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" />
          <button className="auth-submit interactive" type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
      )}
    </main>
  );
}
