"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="store-shell">
      <nav className="navbar">
        <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
      </nav>
      <section className="page-shell" style={{ textAlign: "center" }}>
        <p className="eyebrow">SOMETHING WENT WRONG</p>
        <h1>An unexpected error occurred.</h1>
        <button onClick={reset} className="checkout interactive" style={{ display: "inline-flex", border: "none", cursor: "pointer" }}>
          Try again
        </button>
      </section>
    </main>
  );
}
