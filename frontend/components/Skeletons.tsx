// Storefront placeholders that match the real layouts' dimensions so swapping
// them for content never shifts the page. Shimmer lives in globals.css
// (.skeleton) and is switched off by the reduced-motion block.

function Status({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">Loading</span>
      {children}
    </div>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="product-card" aria-hidden="true">
      <div className="product-image skeleton" />
      <div className="product-info">
        <div className="skeleton skeleton-line" style={{ width: "70%" }} />
        <div className="skeleton skeleton-line" style={{ width: "30%" }} />
      </div>
    </div>
  );
}

export function ProductGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <Status>
      <div className="product-grid" aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <ProductCardSkeleton key={index} />
        ))}
      </div>
    </Status>
  );
}

export function ProductDetailSkeleton() {
  return (
    <Status>
      <section className="product-detail" aria-hidden="true">
        <div className="product-detail-image skeleton" />
        <div className="product-detail-info" style={{ width: "100%" }}>
          <div className="skeleton skeleton-line" style={{ width: "25%" }} />
          <div className="skeleton skeleton-line" style={{ width: "70%", height: 32 }} />
          <div className="skeleton skeleton-line" style={{ width: "20%" }} />
          <div className="skeleton skeleton-line" style={{ width: "100%", height: 64, marginTop: 14 }} />
          <div className="skeleton skeleton-line" style={{ width: "60%", height: 44, marginTop: 14 }} />
          <div className="skeleton skeleton-line" style={{ width: "45%", height: 44, marginTop: 14 }} />
        </div>
      </section>
    </Status>
  );
}

export function OrderSkeleton() {
  return (
    <Status>
      <div className="order-card" style={{ padding: 24 }} aria-hidden="true">
        <div className="skeleton skeleton-line" style={{ width: "40%" }} />
        <div className="skeleton skeleton-line" style={{ width: "100%", height: 48, marginTop: 18 }} />
        <div className="skeleton skeleton-line" style={{ width: "100%", height: 78, marginTop: 18 }} />
        <div className="skeleton skeleton-line" style={{ width: "30%", marginTop: 18 }} />
      </div>
    </Status>
  );
}

export function OrderListSkeleton() {
  return (
    <Status>
      {[0, 1, 2].map((index) => (
        <div key={index} className="skeleton skeleton-line" style={{ width: "100%", height: 64, marginBottom: 12 }} aria-hidden="true" />
      ))}
    </Status>
  );
}
