import Link from "next/link";

export function SiteFooter({ hasChatFab = false }: { hasChatFab?: boolean }) {
  return (
    <footer className={hasChatFab ? "has-chat-fab" : undefined}>
      <Link className="brand" href="/">THREAD<span>&</span>CO</Link>
      <p>© 2026 Thread&amp;Co. Designed for every day.</p>
      <div>
        <Link href="/shop">Shop</Link>
        <Link href="/about">About</Link>
        <Link href="/policies">Policies</Link>
        <Link href="/contact">Contact</Link>
      </div>
    </footer>
  );
}
