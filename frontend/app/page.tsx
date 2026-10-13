"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { subscribeToStorage } from "@/lib/auth-store";
import {
  type Product,
  getWishlistServerSnapshot,
  getWishlistSnapshot,
  productFromApi,
  toggleWishlist,
} from "@/lib/shop-store";
import { useAddToCart } from "@/lib/useAddToCart";
import { ProductCard } from "@/components/ProductCard";
import { SiteFooter } from "@/components/SiteFooter";
import { useInViewport } from "@/lib/useInViewport";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

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
  const [catalog, setCatalog] = useState<Product[]>([]);
  const addToCartApi = useAddToCart();
  const wishlist = useSyncExternalStore(subscribeToStorage, getWishlistSnapshot, getWishlistServerSnapshot);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(loadChatHistory);
  const [chatLoading, setChatLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState(false);

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

  const loadProducts = () => {
    setProductsLoading(true);
    setProductsError(false);
    fetch(`${API_BASE}/products/`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Products unavailable"))))
      .then((data: Array<Record<string, unknown>>) => {
        setCatalog(data.map(productFromApi));
      })
      // A failed fetch surfaces a retry banner instead of silently keeping
      // whatever was in `catalog` - this page used to fall back to a
      // hardcoded demo list on any failure, which looked identical to a
      // working storefront and hid real outages (and never showed products
      // added after the demo list was written).
      .catch(() => setProductsError(true))
      .finally(() => setProductsLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadProducts();
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
        <label className="search-box">
          <span>⌕</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products..." />
        </label>
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
          <span>{productsLoading ? "Loading..." : productsError ? "" : `${filteredProducts.length} styles`}</span>
        </div>
        {productsLoading && <p className="detail-status">Loading products...</p>}
        {!productsLoading && productsError && (
          <div className="detail-status">
            <p>Couldn&apos;t load products right now.</p>
            <button type="button" className="primary-button interactive" onClick={loadProducts} style={{ marginTop: 16, cursor: "pointer" }}>
              Retry
            </button>
          </div>
        )}
        {!productsLoading && !productsError && (
          <>
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
          </>
        )}
      </section>

      <section ref={newBannerRef} className={`story-banner reveal${newBannerVisible ? " is-visible" : ""}`} id="new">
        <div><p className="eyebrow">NEW THIS SEASON</p><h2>Made for<br /><em>every day.</em></h2></div>
        <p>Explore versatile essentials designed to move with you, from easy layers to pieces that make an entrance.</p>
      </section>

      <section ref={aboutBannerRef} className={`story-banner reveal${aboutBannerVisible ? " is-visible" : ""}`} id="about">
        <div><p className="eyebrow">MADE FOR REAL LIFE</p><h2>Less trend.<br /><em>More you.</em></h2></div>
        <p>We believe getting dressed should feel effortless. That&apos;s why we create versatile pieces with considered details, honest materials, and a little room for your personality.</p>
      </section>

      <SiteFooter hasChatFab />

      <button className="chat-fab" onClick={() => setChatOpen(!chatOpen)} aria-label="Open style assistant">✦ <span>Style assistant</span></button>
      {chatOpen && <div className="chat-window"><div className="chat-header"><span><b>✦</b> Thread&Co assistant</span><button onClick={() => setChatOpen(false)}>×</button></div><div className="chat-body"><div className="chat-messages">{chatHistory.map((message, index) => <div className={message.role === "user" ? "user-message" : "bot-message"} key={`${message.role}-${index}`}>{message.content}</div>)}{chatLoading && <div className="bot-message">Finding the best style for you...</div>}</div><div className="chat-suggestions"><button onClick={() => setChatInput("Help me find an outfit")}>Help me find an outfit</button><button onClick={() => setChatInput("What's new?")}>What&apos;s new?</button></div></div><div className="chat-input"><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendChat()} placeholder="Ask me anything..." /><button onClick={sendChat}>↑</button></div></div>}
    </main>
  );
}
