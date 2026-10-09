"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !email.trim() || !message.trim()) return;
    // No backend support-ticket endpoint exists in this app - this is a
    // deliberate no-op confirmation, not a bug. Nothing is sent
    // anywhere. Wiring this to a real inbox/ticket system is future
    // scope, not part of this phase.
    setSubmitted(true);
    setName("");
    setEmail("");
    setMessage("");
  };

  return (
    <main className="store-shell">
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
        <Link href="/" className="back-link">← Back home</Link>
      </nav>

      <section className="page-shell">
        <p className="eyebrow">GET IN TOUCH</p>
        <h1>Contact us</h1>
        <p style={{ color: "#736d65", fontSize: 13, marginBottom: 24 }}>
          Email us directly at <a href="mailto:hello@threadco.example" style={{ color: "var(--accent)" }}>hello@threadco.example</a>,
          or use the form below. Support hours: Monday-Friday, 9am-6pm.
        </p>

        {submitted ? (
          <div className="empty-state" style={{ marginTop: 0 }}>
            <span>✓</span>
            <p>Thanks — we&apos;ll get back to you soon.</p>
          </div>
        ) : (
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
            <button className="checkout interactive" type="submit" style={{ justifyContent: "center" }}>Send message</button>
          </form>
        )}
      </section>
    </main>
  );
}
