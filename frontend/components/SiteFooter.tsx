import Link from "next/link";

// Always leaves room for the floating style assistant launcher.
export function SiteFooter() {
  return (
    <footer className="has-chat-fab">
      <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
      <p>© 2026 Thread&amp;Co. Designed for every day.</p>
      <div>
        <Link href="/shop">Shop</Link>
        <Link href="/lookbook">Lookbook</Link>
        <Link href="/about">About</Link>
        <Link href="/policies">Policies</Link>
        <Link href="/contact">Contact</Link>
      </div>
    </footer>
  );
}
