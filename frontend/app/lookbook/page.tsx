"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LookCard, type Look } from "@/components/LookCard";
import { SiteFooter } from "@/components/SiteFooter";
import { productFromApi } from "@/lib/shop-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export default function LookbookPage() {
  const [looks, setLooks] = useState<Look[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/products/looks`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("looks unavailable"))))
      .then((data: Array<{ product: Record<string, unknown>; companions: Array<Record<string, unknown>> }>) =>
        setLooks(data.map((look) => ({ product: productFromApi(look.product), companions: look.companions.map(productFromApi) }))),
      )
      .catch(() => setFailed(true));
  }, []);

  return (
    <main className="store-shell">
      <section className="products-section">
        <div className="section-heading">
          <div><p className="eyebrow">STYLED FOR YOU</p><h2>Lookbook</h2></div>
          <span>{looks ? `${looks.length} looks` : ""}</span>
        </div>

        {looks === null && !failed && (
          <div role="status" className="lookbook-list">
            <span className="sr-only">Loading</span>
            {[0, 1].map((index) => (
              <div key={index} className="look-card" aria-hidden="true">
                <div className="look-anchor skeleton" />
                <div className="look-pieces">
                  <div className="skeleton skeleton-line" style={{ width: "40%" }} />
                  <div className="skeleton skeleton-line" style={{ width: "70%", height: 80 }} />
                </div>
              </div>
            ))}
          </div>
        )}
        {failed && <p className="detail-status">We couldn&apos;t load the lookbook right now.</p>}
        {looks && looks.length === 0 && (
          <div className="empty-state" style={{ marginTop: "8vh" }}>
            <span>♧</span>
            <p>New looks are on the way</p>
            <small>We&apos;re still putting outfits together.</small>
            <div style={{ marginTop: 18 }}>
              <Link href="/shop" className="primary-button interactive" style={{ display: "inline-block" }}>Browse the shop</Link>
            </div>
          </div>
        )}
        {looks && looks.length > 0 && (
          <div className="lookbook-list">
            {looks.map((look) => <LookCard key={look.product.id} look={look} />)}
          </div>
        )}
      </section>
      <SiteFooter />
    </main>
  );
}
