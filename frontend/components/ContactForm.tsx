"use client";

import { useState, type FormEvent } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/contact/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      if (!response.ok) {
        setError("Could not send your message. Please try again.");
        return;
      }
      setSubmitted(true);
      setName("");
      setEmail("");
      setMessage("");
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="empty-state" style={{ marginTop: 0 }}>
        <span>✓</span>
        <p>Thanks — we&apos;ll get back to you soon.</p>
      </div>
    );
  }

  return (
    <form className="shipping-form" style={{ borderTop: "none", paddingTop: 0 }} onSubmit={handleSubmit}>
      <input required placeholder="Your name" value={name} onChange={(event) => setName(event.target.value)} />
      <input required type="email" placeholder="Your email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <textarea
        required
        placeholder="How can we help?"
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        rows={5}
        style={{ border: "1px solid var(--line)", background: "white", padding: 10, fontSize: 12, outlineColor: "var(--accent)", resize: "vertical" }}
      />
      {error && <p style={{ color: "#b23b3b", fontSize: 12 }}>{error}</p>}
      <button className="checkout interactive" type="submit" disabled={loading} style={{ justifyContent: "center" }}>
        {loading ? "Sending…" : "Send message"}
      </button>
    </form>
  );
}
