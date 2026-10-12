import Link from "next/link";

export default function NotFound() {
  return (
    <main className="store-shell">
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
        <Link href="/" className="back-link">← Back home</Link>
      </nav>
      <section className="page-shell" style={{ textAlign: "center" }}>
        <p className="eyebrow">404</p>
        <h1>This page doesn&apos;t exist.</h1>
        <p style={{ color: "#736d65", fontSize: 13, marginBottom: 24 }}>
          The page you&apos;re looking for may have moved or been removed.
        </p>
        <Link href="/" className="checkout interactive" style={{ display: "inline-flex" }}>Back to shop</Link>
      </section>
    </main>
  );
}
