import { ProductGridSkeleton } from "@/components/Skeletons";

export default function Loading() {
  return (
    <main className="store-shell">
      <section className="products-section">
        <ProductGridSkeleton count={6} />
      </section>
    </main>
  );
}
