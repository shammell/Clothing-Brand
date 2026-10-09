"use client";

import Link from "next/link";

export default function PoliciesPage() {
  return (
    <main className="store-shell">
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
        <Link href="/" className="back-link">← Back home</Link>
      </nav>

      <section className="page-shell">
        <p className="eyebrow">THE FINE PRINT</p>
        <h1>Policies</h1>
        <div style={{ display: "flex", gap: 20, marginBottom: 32, fontSize: 12 }}>
          <a href="#privacy" style={{ color: "var(--accent)" }}>Privacy Policy</a>
          <a href="#terms" style={{ color: "var(--accent)" }}>Terms of Service</a>
          <a href="#returns" style={{ color: "var(--accent)" }}>Returns &amp; Refunds</a>
        </div>

        <h2 id="privacy" style={{ fontSize: 24, marginTop: 40, marginBottom: 12 }}>Privacy Policy</h2>
        <p style={{ color: "#736d65", fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}>
          We collect the information you give us when you create an
          account or place an order — your name, email, shipping
          address, and order history — solely to operate the store and
          fulfill your orders. We do not sell your data to third
          parties. Account passwords are stored hashed, never in plain
          text.
        </p>

        <h2 id="terms" style={{ fontSize: 24, marginTop: 40, marginBottom: 12 }}>Terms of Service</h2>
        <p style={{ color: "#736d65", fontSize: 13, lineHeight: 1.8, marginBottom: 16 }}>
          By creating an account or placing an order, you agree to
          provide accurate information and to use Thread&amp;Co only for
          lawful personal purchases. We reserve the right to cancel
          orders or suspend accounts in cases of suspected fraud or
          abuse.
        </p>

        <h2 id="returns" style={{ fontSize: 24, marginTop: 40, marginBottom: 12 }}>Returns &amp; Refunds</h2>
        <p style={{ color: "#736d65", fontSize: 13, lineHeight: 1.8 }}>
          Unworn items in original condition can be returned within 30
          days of delivery for a full refund to your original payment
          method. Contact us at <Link href="/contact" style={{ color: "var(--accent)" }}>our contact page</Link> to
          start a return.
        </p>
      </section>
    </main>
  );
}
