"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  getAuthServerSnapshot,
  getCurrentUserSnapshot,
  subscribeToStorage,
} from "@/lib/auth-store";
import {
  type Product,
  getCartServerSnapshot,
  getCartSnapshot,
  getWishlistServerSnapshot,
  getWishlistSnapshot,
  productFromApi,
  toggleWishlist,
} from "@/lib/shop-store";
import { useAddToCart } from "@/lib/useAddToCart";
import { ProductCard } from "@/components/ProductCard";
import { useInViewport } from "@/lib/useInViewport";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

const products: Product[] = [
  {
    id: "demo-1",
    name: "Classic Cotton T-Shirt",
    category: "T-Shirts",
    price: 19.99,
    rating: 4.5,
    image: "/products/cotton-tshirt.svg",
    colors: ["#171717", "#f5f5f4", "#243b53"],
    sizes: ["S", "M", "L", "XL"],
    badge: "Bestseller",
  },
  {
    id: "demo-2",
    name: "Slim Fit Denim Jeans",
    category: "Jeans",
    price: 49.99,
    rating: 4.3,
    image: "/products/denim-jeans.svg",
    colors: ["#31506b", "#171717"],
    sizes: ["30", "32", "34", "36"],
  },
  {
    id: "demo-3",
    name: "Lightweight Summer Dress",
    category: "Dresses",
    price: 39.99,
    rating: 4.7,
    image: "/products/summer-dress.svg",
    colors: ["#b94343", "#fafafa", "#d3a4a0"],
    sizes: ["XS", "S", "M", "L"],
    badge: "New",
  },
  {
    id: "demo-4",
    name: "Classic Zip Hoodie",
    category: "Hoodies",
    price: 44.99,
    rating: 4.6,
    image: "/products/zip-hoodie.svg",
    colors: ["#9b9b98", "#171717", "#38533d"],
    sizes: ["S", "M", "L", "XL"],
  },
  {
    id: "demo-5",
    name: "Leather Casual Sneakers",
    category: "Shoes",
    price: 59.99,
    rating: 4.4,
    image: "/products/casual-sneakers.svg",
    colors: ["#f5f5f5", "#171717"],
    sizes: ["7", "8", "9", "10", "11"],
  },
  {
    id: "demo-6",
    name: "Relaxed Linen Shirt",
    category: "Shirts",
    price: 34.99,
    rating: 4.8,
    image: "/products/linen-shirt.svg",
    colors: ["#e6dfd1", "#d6dce1", "#fafafa"],
    sizes: ["S", "M", "L", "XL"],
    badge: "Trending",
  },
];

const categories = ["All", "T-Shirts", "Jeans", "Dresses", "Hoodies", "Shoes", "Shirts"];

type ChatMessage = { role: "user" | "assistant"; content: string };
const CHAT_STORAGE_KEY = "threadco_chat_history";
const INITIAL_CHAT_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "Hi! I'm here to help you find your perfect style. What are you looking for today?",
};

function loadChatHistory(): ChatMessage[] {
  if (typeof window === "undefined") return [INITIAL_CHAT_MESSAGE];
  try {
    const stored = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) ?? "null");
    if (!Array.isArray(stored)) return [INITIAL_CHAT_MESSAGE];
    const valid = stored.filter(
      (message): message is ChatMessage =>
        (message?.role === "user" || message?.role === "assistant") &&
        typeof message.content === "string" &&
        message.content.trim().length > 0,
    );
    return valid.length ? valid : [INITIAL_CHAT_MESSAGE];
  } catch {
    return [INITIAL_CHAT_MESSAGE];
  }
}

export default function Home() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<Product[]>(products);
  const cart = useSyncExternalStore(subscribeToStorage, getCartSnapshot, getCartServerSnapshot);
  const addToCartApi = useAddToCart();
  const wishlist = useSyncExternalStore(subscribeToStorage, getWishlistSnapshot, getWishlistServerSnapshot);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(loadChatHistory);
  const [chatLoading, setChatLoading] = useState(false);
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const [isLiveCatalog, setIsLiveCatalog] = useState(false);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  // One-shot cart-icon bump when an item is added, not on every render or on
  // initial load. `previousCartCountRef` starts at `null` (not 0): cart is
  // localStorage-backed via useSyncExternalStore, which reads the server
  // snapshot ([]) on the very first render and self-corrects to the real
  // value one render later - starting the ref at 0 would make a returning
  // visitor who already has items in their bag see a false bump on page
  // load, the moment that correction lands (cartCount jumping from 0 to
  // their real count looks identical to "an item was just added"). Gating
  // on hasHydrated (same one-tick-after-mount pattern used throughout this
  // phase) means the ref's first real write happens after that correction,
  // recording the true baseline instead of comparing against a placeholder.
  const [hasHydrated, setHasHydrated] = useState(false);
  useEffect(() => {
    // One-time "past first client paint" signal, not the derived-state
    // anti-pattern this rule targets - same justification as the existing
    // disable in app/admin/page.tsx.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasHydrated(true);
  }, []);
  const previousCartCountRef = useRef<number | null>(null);
  const [cartBumped, setCartBumped] = useState(false);
  useEffect(() => {
    if (!hasHydrated) return;
    if (previousCartCountRef.current !== null && cartCount > previousCartCountRef.current) {
      setCartBumped(true);
      const timeout = setTimeout(() => setCartBumped(false), 420);
      previousCartCountRef.current = cartCount;
      return () => clearTimeout(timeout);
    }
    previousCartCountRef.current = cartCount;
  }, [hasHydrated, cartCount]);

  // Destructured immediately rather than kept as `newBanner.ref`/
  // `newBanner.isVisible`: the React Compiler's ESLint rule can't verify
  // property access on an object returned from a custom hook is safe
  // during render (it flags the whole object once it sees a ref inside
  // it, isVisible included), but a directly-destructured binding is a
  // pattern it recognizes as safe.
  const { ref: newBannerRef, isVisible: newBannerVisible } = useInViewport<HTMLDivElement>();
  const { ref: aboutBannerRef, isVisible: aboutBannerVisible } = useInViewport<HTMLDivElement>();

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistory.slice(-20)));
  }, [chatHistory]);

  useEffect(() => {
    fetch(`${API_BASE}/products/`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Products unavailable"))))
      .then((data: Array<Record<string, unknown>>) => {
        if (!data.length) return;
        setCatalog(data.map(productFromApi));
        setIsLiveCatalog(true);
      })
      .catch(() => undefined);
  }, []);

  const filteredProducts = useMemo(
    () =>
      catalog.filter(
        (product) =>
          (activeCategory === "All" || product.category === activeCategory) &&
          product.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [activeCategory, query, catalog],
  );

  const sendChat = async () => {
    const message = chatInput.trim();
    if (!message || chatLoading) return;
    setChatInput("");
    setChatLoading(true);
    const requestHistory = chatHistory.slice(-19);
    setChatHistory((history) => [
      ...history.slice(-18),
      { role: "user", content: message },
    ]);
    try {
      const response = await fetch(`${API_BASE}/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history: requestHistory }),
      });
      const data = await response.json();
      if (!response.ok) {
        setChatHistory((history) => [
          ...history,
          { role: "assistant", content: "Sorry, the style assistant is unavailable right now." },
        ]);
        return;
      }
      const reply = typeof data.reply === "string" ? data.reply : "Sorry, I could not understand that response.";
      setChatHistory((history) => [
        ...history.slice(-18),
        { role: "assistant", content: reply },
      ]);
    } catch {
      setChatHistory((history) => [
        ...history,
        { role: "assistant", content: "Sorry, I could not connect to the style assistant." },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  return (
    <main className="store-shell">
      <div className="announcement">Free shipping on orders over $75 <span>•</span> Easy 30-day returns</div>
      <nav className="navbar">
        <a className="brand" href="#">THREAD<span>&</span>CO</a>
        <div className="nav-links">
          <Link href="/shop">Shop</Link>
          <a href="#new">New arrivals</a>
          <a href="#about">Our story</a>
        </div>
        <div className="nav-actions">
          <label className="search-box">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products..." />
          </label>
          <Link
            href={currentUser ? "/account" : "/login"}
            className="icon-button interactive"
            aria-label={currentUser ? "Your account" : "Open account"}
            title={currentUser ? `Signed in as ${currentUser}` : "Log in"}
          >
            {currentUser ? currentUser[0].toUpperCase() : "♙"}
          </Link>
          <Link href="/cart" className={`icon-button cart-button interactive${cartBumped ? " bump" : ""}`} aria-label="Open cart">
            ♧ <b>{cartCount}</b>
          </Link>
        </div>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">THE EVERYDAY EDIT</p>
          <h1>Style that feels<br /><em>like you.</em></h1>
          <p className="hero-text">Thoughtfully made essentials for every version of your day. Find your new favorites, made to last.</p>
          <a className="primary-button" href="#shop">Shop the collection <span>→</span></a>
        </div>
        <div className="hero-image">
          <div className="hero-tag">NEW SEASON<br /><strong>ESSENTIALS</strong></div>
        </div>
      </section>

      <section className="category-strip">
        <p>Explore the edit</p>
        <div className="category-list">
          {categories.map((category) => (
            <button className={activeCategory === category ? "category active" : "category"} key={category} onClick={() => setActiveCategory(category)}>
              {category}
            </button>
          ))}
        </div>
      </section>

      <section className="products-section" id="shop">
        <div className="section-heading">
          <div><p className="eyebrow">CURATED FOR YOU</p><h2>Fresh picks</h2></div>
          <span>{filteredProducts.length} styles{!isLiveCatalog && " · demo preview, backend offline"}</span>
        </div>
        <div className="product-grid">
          {filteredProducts.slice(0, 6).map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              wishlist={wishlist}
              onToggleWishlist={(id) => toggleWishlist(wishlist, id)}
              {...addToCartApi}
            />
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 40 }}>
          <Link href="/shop" className="primary-button interactive" style={{ display: "inline-block" }}>
            Shop all <span>→</span>
          </Link>
        </div>
      </section>

      <section ref={newBannerRef} className={`story-banner reveal${newBannerVisible ? " is-visible" : ""}`} id="new">
        <div><p className="eyebrow">NEW THIS SEASON</p><h2>Made for<br /><em>every day.</em></h2></div>
        <p>Explore versatile essentials designed to move with you, from easy layers to pieces that make an entrance.</p>
      </section>

      <section ref={aboutBannerRef} className={`story-banner reveal${aboutBannerVisible ? " is-visible" : ""}`} id="about">
        <div><p className="eyebrow">MADE FOR REAL LIFE</p><h2>Less trend.<br /><em>More you.</em></h2></div>
        <p>We believe getting dressed should feel effortless. That&apos;s why we create versatile pieces with considered details, honest materials, and a little room for your personality.</p>
      </section>

      <footer id="contact"><a className="brand" href="#">THREAD<span>&</span>CO</a><p>© 2026 Thread&Co. Designed for every day.</p><div><a href="#shop">Shop</a><a href="#about">About</a><a href="mailto:hello@threadco.example">Contact</a></div></footer>

      <button className="chat-fab" onClick={() => setChatOpen(!chatOpen)} aria-label="Open style assistant">✦ <span>Style assistant</span></button>
      {chatOpen && <div className="chat-window"><div className="chat-header"><span><b>✦</b> Thread&Co assistant</span><button onClick={() => setChatOpen(false)}>×</button></div><div className="chat-body"><div className="chat-messages">{chatHistory.map((message, index) => <div className={message.role === "user" ? "user-message" : "bot-message"} key={`${message.role}-${index}`}>{message.content}</div>)}{chatLoading && <div className="bot-message">Finding the best style for you...</div>}</div><div className="chat-suggestions"><button onClick={() => setChatInput("Help me find an outfit")}>Help me find an outfit</button><button onClick={() => setChatInput("What's new?")}>What&apos;s new?</button></div></div><div className="chat-input"><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendChat()} placeholder="Ask me anything..." /><button onClick={sendChat}>↑</button></div></div>}
    </main>
  );
}
