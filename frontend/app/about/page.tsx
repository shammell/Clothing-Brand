"use client";

import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="store-shell">
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
        <Link href="/" className="back-link">← Back home</Link>
      </nav>

      <section className="page-shell">
        <p className="eyebrow">OUR STORY</p>
        <h1>Made for real life.</h1>
        <p style={{ color: "#736d65", fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>
          Thread&amp;Co started with a simple idea: getting dressed should
          feel effortless. We design versatile, everyday essentials with
          considered details and honest materials — pieces meant to move
          with you, not just sit in your closet.
        </p>
        <p style={{ color: "#736d65", fontSize: 14, lineHeight: 1.8, marginBottom: 20 }}>
          Every piece in our collection is chosen for how it actually
          gets worn: layered on a busy morning, dressed up for an
          evening out, or kept simple on a slow Sunday. Less trend, more
          you.
        </p>
        <p style={{ color: "#736d65", fontSize: 14, lineHeight: 1.8 }}>
          We&apos;re a small team that cares about fit, fabric, and
          making sure what you order is what shows up at your door —
          which is also why our returns policy is as simple as we could
          make it. See our <Link href="/policies" style={{ color: "var(--accent)" }}>policies</Link> for details.
        </p>
      </section>
    </main>
  );
}
