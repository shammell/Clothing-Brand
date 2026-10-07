"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  authenticatedFetch,
  extractErrorMessage,
  getAuthServerSnapshot,
  getAuthTokenSnapshot,
  getCurrentUserSnapshot,
  STORAGE_SYNC_EVENT,
  subscribeToStorage,
  writeAuth,
} from "@/lib/auth-store";

type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  rating: number;
  image: string;
  colors: string[];
  sizes: string[];
  badge?: string;
};

type CartLine = Product & { size: string; color: string };

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  size: string;
  color: string;
};

type Order = {
  id: string;
  items: OrderItem[];
  total: number;
  status: string;
  createdAt: string;
};

const FALLBACK_IMAGE = "/products/no-image.svg";
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8003";
// Deliberate, brief pacing for the "Add to bag" button's adding -> added
// transition - the cart write itself is synchronous (local state, no network
// round trip), but an instant jump from "Add to bag" straight to "Added"
// reads as no feedback at all. This is purely a perceived-affordance delay,
// not masking any real async work.
const ADD_FEEDBACK_ADDING_MS = 350;
const ADD_FEEDBACK_ADDED_MS = 1100;

function resolveImageUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return FALLBACK_IMAGE;
  const imageUrl = value.trim();
  if (imageUrl.startsWith("/") || /^https?:\/\//i.test(imageUrl)) return imageUrl;
  return FALLBACK_IMAGE;
}

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

// Wishlist uses the same useSyncExternalStore approach as auth (see
// lib/auth-store.ts) for the same reason - it renders into the always-visible
// heart icons, so it needs a server-safe default and a post-hydration real
// value, with no mismatch in between.
const WISHLIST_STORAGE_KEY = "threadco_wishlist";
const EMPTY_WISHLIST: string[] = [];

// getSnapshot must return the same array reference when the underlying data
// hasn't changed, or React treats every call as "changed" and re-renders in
// a loop - so the parsed array is cached and only re-parsed when the raw
// stored string actually differs from last time.
let wishlistCache: { raw: string | null; value: string[] } = { raw: null, value: EMPTY_WISHLIST };

function getWishlistSnapshot(): string[] {
  const raw = localStorage.getItem(WISHLIST_STORAGE_KEY);
  if (raw === wishlistCache.raw) return wishlistCache.value;
  let value: string[] = EMPTY_WISHLIST;
  try {
    const parsed = JSON.parse(raw ?? "null");
    if (Array.isArray(parsed)) value = parsed.filter((id): id is string => typeof id === "string");
  } catch {
    value = EMPTY_WISHLIST;
  }
  wishlistCache = { raw, value };
  return value;
}
function getWishlistServerSnapshot(): string[] {
  return EMPTY_WISHLIST;
}

function writeWishlist(next: string[]): void {
  localStorage.setItem(WISHLIST_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(STORAGE_SYNC_EVENT));
}

// Cart follows the exact same useSyncExternalStore pattern as wishlist above,
// for the same reason: it renders into the always-visible cart-count badge,
// so it needs a server-safe default and a post-hydration real value with no
// mismatch in between - and it needs to survive a reload, same as the
// customer's wishlist does, rather than vanishing the moment they refresh.
const CART_STORAGE_KEY = "threadco_cart";
const EMPTY_CART: CartLine[] = [];

function isValidCartLine(value: unknown): value is CartLine {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === "string" &&
    typeof record.name === "string" &&
    typeof record.category === "string" &&
    typeof record.price === "number" &&
    typeof record.rating === "number" &&
    typeof record.image === "string" &&
    Array.isArray(record.colors) &&
    Array.isArray(record.sizes) &&
    typeof record.size === "string" &&
    typeof record.color === "string"
  );
}

let cartCache: { raw: string | null; value: CartLine[] } = { raw: null, value: EMPTY_CART };

function getCartSnapshot(): CartLine[] {
  const raw = localStorage.getItem(CART_STORAGE_KEY);
  if (raw === cartCache.raw) return cartCache.value;
  let value: CartLine[] = EMPTY_CART;
  try {
    const parsed = JSON.parse(raw ?? "null");
    if (Array.isArray(parsed)) value = parsed.filter(isValidCartLine);
  } catch {
    value = EMPTY_CART;
  }
  cartCache = { raw, value };
  return value;
}
function getCartServerSnapshot(): CartLine[] {
  return EMPTY_CART;
}

function writeCart(next: CartLine[]): void {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(STORAGE_SYNC_EVENT));
}

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
  const [cartOpen, setCartOpen] = useState(false);
  const [selections, setSelections] = useState<Record<string, { size: string; color: string }>>({});
  const [sizeErrors, setSizeErrors] = useState<Record<string, boolean>>({});
  // Purely transient UI feedback for the "Add to bag" button (idle -> adding
  // -> added -> idle) - never persisted, since it describes an in-flight
  // animation, not cart data. Keyed by product id so clicking one product
  // doesn't affect another's button state.
  const [addStatus, setAddStatus] = useState<Record<string, "adding" | "added">>({});
  const addTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
  const wishlist = useSyncExternalStore(subscribeToStorage, getWishlistSnapshot, getWishlistServerSnapshot);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(loadChatHistory);
  const [chatLoading, setChatLoading] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const [isLiveCatalog, setIsLiveCatalog] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");

  useEffect(() => {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chatHistory.slice(-20)));
  }, [chatHistory]);

  useEffect(() => {
    // Capture the ref's container (not the ref itself) so cleanup still has
    // a real object to iterate, even though addTimeoutsRef.current may have
    // been mutated further by the time this runs.
    const timeoutsByProduct = addTimeoutsRef.current;
    return () => {
      Object.values(timeoutsByProduct).flat().forEach((id) => clearTimeout(id));
    };
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/products/`)
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Products unavailable"))))
      .then((data: Array<Record<string, unknown>>) => {
        if (!data.length) return;
        setCatalog(data.map((item) => ({
          id: String(item.id),
          name: String(item.name),
          category: String(item.category),
          price: Number(item.price),
          rating: Number(item.rating ?? 0),
          image: resolveImageUrl(item.image_url),
          colors: Array.isArray(item.colors) ? item.colors.map(String) : [],
          sizes: Array.isArray(item.sizes) ? item.sizes.map(String) : [],
        })));
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

  const getSelection = (product: Product) =>
    selections[product.id] ?? { size: "", color: product.colors[0] ?? "" };

  const selectSize = (product: Product, size: string) => {
    setSelections((current) => ({ ...current, [product.id]: { ...getSelection(product), size } }));
    setSizeErrors((current) => ({ ...current, [product.id]: false }));
  };

  const selectColor = (product: Product, color: string) => {
    setSelections((current) => ({ ...current, [product.id]: { ...getSelection(product), color } }));
  };

  const addToCart = (product: Product) => {
    const selection = getSelection(product);
    if (!selection.size) {
      setSizeErrors((current) => ({ ...current, [product.id]: true }));
      return;
    }
    writeCart([...cart, { ...product, size: selection.size, color: selection.color }]);

    // Clear-before-set: if this product was already mid-cycle from a
    // previous click, cancel those pending timeouts first so rapid re-clicks
    // restart a clean idle->adding->added sequence instead of two overlapping
    // cycles racing to update addStatus out of order.
    (addTimeoutsRef.current[product.id] ?? []).forEach((id) => clearTimeout(id));
    setAddStatus((current) => ({ ...current, [product.id]: "adding" }));
    const addedTimeout = setTimeout(() => {
      setAddStatus((current) => ({ ...current, [product.id]: "added" }));
      const idleTimeout = setTimeout(() => {
        setAddStatus((current) => {
          const next = { ...current };
          delete next[product.id];
          return next;
        });
      }, ADD_FEEDBACK_ADDED_MS);
      addTimeoutsRef.current[product.id] = [idleTimeout];
    }, ADD_FEEDBACK_ADDING_MS);
    addTimeoutsRef.current[product.id] = [addedTimeout];
  };

  const removeFromCart = (index: number) => {
    writeCart(cart.filter((_, cartIndex) => cartIndex !== index));
  };
  const toggleWishlist = (productId: string) => {
    const next = wishlist.includes(productId)
      ? wishlist.filter((id) => id !== productId)
      : [...wishlist, productId];
    writeWishlist(next);
  };
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
  const submitAuth = async () => {
    setAuthError("");
    const endpoint = authMode === "login" ? "/auth/login" : "/auth/register";
    const body = authMode === "login"
      ? { email: authEmail, password: authPassword }
      : { username: authName, email: authEmail, password: authPassword };
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setAuthError(extractErrorMessage(data, "Authentication failed."));
        return;
      }
      writeAuth(data.access_token, data.user.username, Boolean(data.user.is_admin));
      setAuthOpen(false);
      setAuthPassword("");
    } catch {
      setAuthError("Could not connect to the server.");
    }
  };

  const logout = () => {
    writeAuth("", "");
  };

  const fetchOrders = async (token: string) => {
    setOrdersLoading(true);
    setOrdersError("");
    try {
      const response = await authenticatedFetch(`${API_BASE}/orders/me`, token);
      if (response.status === 401) {
        // The backend only rejects this with 401 if the token is expired or invalid,
        // so the "logged in" UI state is already stale — clear it instead of leaving
        // a user stuck looking logged in while every authenticated call keeps failing.
        logout();
        setOrdersError("Your session expired. Please log in again.");
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setOrdersError(extractErrorMessage(data, "Could not load your orders."));
        return;
      }
      setOrders((data as Array<Record<string, unknown>>).map((order) => {
        const items = Array.isArray(order.items) ? order.items : [];
        return {
          id: String(order.id),
          status: String(order.status),
          total: Number(order.total),
          createdAt: String(order.created_at),
          items: items.map((item) => {
            const record = item as Record<string, unknown>;
            return {
              productId: String(record.product_id),
              name: String(record.name),
              price: Number(record.price),
              quantity: Number(record.quantity),
              subtotal: Number(record.subtotal),
              size: String(record.size ?? ""),
              color: String(record.color ?? ""),
            };
          }),
        };
      }));
    } catch {
      setOrdersError("Could not connect to the server.");
    } finally {
      setOrdersLoading(false);
    }
  };

  const openOrders = () => {
    setOrdersOpen(true);
    if (authToken) fetchOrders(authToken);
  };

  const checkout = async () => {
    if (!authToken) {
      setCheckoutError("Please log in to check out.");
      setCartOpen(false);
      setAuthOpen(true);
      return;
    }
    if (!cart.length) return;
    setCheckoutError("");
    setCheckoutLoading(true);
    try {
      const items = cart.map((item) => ({
        product_id: item.id,
        quantity: 1,
        size: item.size,
        color: item.color,
      }));
      const response = await authenticatedFetch(`${API_BASE}/orders/`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
      if (response.status === 401) {
        logout();
        setCheckoutError("Your session expired. Please log in again.");
        setCartOpen(false);
        setAuthOpen(true);
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        setCheckoutError(extractErrorMessage(data, "Could not place the order."));
        return;
      }
      writeCart([]);
      setCartOpen(false);
    } catch {
      setCheckoutError("Could not connect to the server.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  return (
    <main className="store-shell">
      <div className="announcement">Free shipping on orders over $75 <span>•</span> Easy 30-day returns</div>
      <nav className="navbar">
        <a className="brand" href="#">THREAD<span>&</span>CO</a>
        <div className="nav-links">
          <a href="#shop">Shop</a>
          <a href="#new">New arrivals</a>
          <a href="#about">Our story</a>
        </div>
        <div className="nav-actions">
          <label className="search-box">
            <span>⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products..." />
          </label>
          <button
            className="icon-button"
            aria-label={currentUser ? "View your orders" : "Open account"}
            title={currentUser ? `Signed in as ${currentUser}` : "Log in"}
            onClick={() => (currentUser ? openOrders() : setAuthOpen(true))}
          >
            {currentUser ? currentUser[0].toUpperCase() : "♙"}
          </button>
          <button className="icon-button cart-button" aria-label="Open cart" onClick={() => setCartOpen(true)}>
            ♧ <b>{cart.length}</b>
          </button>
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
          {filteredProducts.map((product) => (
            <article className="product-card" key={product.id}>
              <div className="product-image">
                {product.badge && <span className="badge">{product.badge}</span>}
                <img
                  src={product.image}
                  alt={product.name}
                  onError={(event) => {
                    event.currentTarget.onerror = null;
                    event.currentTarget.src = FALLBACK_IMAGE;
                  }}
                />
                <button
                  className={wishlist.includes(product.id) ? "heart active" : "heart"}
                  aria-label={wishlist.includes(product.id) ? `Remove ${product.name} from saved` : `Save ${product.name}`}
                  aria-pressed={wishlist.includes(product.id)}
                  onClick={() => toggleWishlist(product.id)}
                >
                  {wishlist.includes(product.id) ? "♥" : "♡"}
                </button>
                <button
                  className={addStatus[product.id] ? `quick-add ${addStatus[product.id]}` : "quick-add"}
                  disabled={addStatus[product.id] === "adding"}
                  onClick={() => addToCart(product)}
                >
                  {addStatus[product.id] === "adding" ? "Adding..." : addStatus[product.id] === "added" ? "Added ✓" : <>Add to bag <span>+</span></>}
                </button>
              </div>
              <div className="product-info">
                <div><h3>{product.name}</h3><p>{product.category}</p></div>
                <strong>${product.price.toFixed(2)}</strong>
              </div>
              <div className="size-row">
                {product.sizes.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={getSelection(product).size === size ? "size-chip active" : "size-chip"}
                    aria-pressed={getSelection(product).size === size}
                    onClick={() => selectSize(product, size)}
                  >
                    {size}
                  </button>
                ))}
              </div>
              {sizeErrors[product.id] && <p className="size-error">Select a size to add to bag</p>}
              <div className="product-meta">
                <span className="stars">★★★★★ <small>{product.rating}</small></span>
                <span className="swatches">
                  {product.colors.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className={getSelection(product).color === color ? "swatch active" : "swatch"}
                      style={{ backgroundColor: color }}
                      aria-label={`Select color ${color}`}
                      aria-pressed={getSelection(product).color === color}
                      onClick={() => selectColor(product, color)}
                    />
                  ))}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="story-banner" id="new">
        <div><p className="eyebrow">NEW THIS SEASON</p><h2>Made for<br /><em>every day.</em></h2></div>
        <p>Explore versatile essentials designed to move with you, from easy layers to pieces that make an entrance.</p>
      </section>

      <section className="story-banner" id="about">
        <div><p className="eyebrow">MADE FOR REAL LIFE</p><h2>Less trend.<br /><em>More you.</em></h2></div>
        <p>We believe getting dressed should feel effortless. That&apos;s why we create versatile pieces with considered details, honest materials, and a little room for your personality.</p>
      </section>

      <footer id="contact"><a className="brand" href="#">THREAD<span>&</span>CO</a><p>© 2026 Thread&Co. Designed for every day.</p><div><a href="#shop">Shop</a><a href="#about">About</a><a href="mailto:hello@threadco.example">Contact</a></div></footer>

      <button className="chat-fab" onClick={() => setChatOpen(!chatOpen)} aria-label="Open style assistant">✦ <span>Style assistant</span></button>
      {chatOpen && <div className="chat-window"><div className="chat-header"><span><b>✦</b> Thread&Co assistant</span><button onClick={() => setChatOpen(false)}>×</button></div><div className="chat-body"><div className="chat-messages">{chatHistory.map((message, index) => <div className={message.role === "user" ? "user-message" : "bot-message"} key={`${message.role}-${index}`}>{message.content}</div>)}{chatLoading && <div className="bot-message">Finding the best style for you...</div>}</div><div className="chat-suggestions"><button onClick={() => setChatInput("Help me find an outfit")}>Help me find an outfit</button><button onClick={() => setChatInput("What's new?")}>What&apos;s new?</button></div></div><div className="chat-input"><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => event.key === "Enter" && sendChat()} placeholder="Ask me anything..." /><button onClick={sendChat}>↑</button></div></div>}
      {authOpen && <div className="drawer-backdrop" onClick={() => setAuthOpen(false)}><section className="auth-modal" onClick={(event) => event.stopPropagation()}><button className="auth-close" onClick={() => setAuthOpen(false)}>×</button><p className="eyebrow">WELCOME TO THREAD&CO</p><h2>{authMode === "login" ? "Welcome back." : "Create your account."}</h2>{authMode === "register" && <input value={authName} onChange={(event) => setAuthName(event.target.value)} placeholder="Your name" /> }<input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="Email address" /><input type="password" value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="Password" />{authError && <p className="auth-error">{authError}</p>}<button className="auth-submit" onClick={submitAuth}>{authMode === "login" ? "Log in" : "Create account"}</button><button className="auth-switch" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}>{authMode === "login" ? "Need an account? Sign up" : "Already have an account? Log in"}</button></section></div>}
      {cartOpen && <div className="drawer-backdrop" onClick={() => setCartOpen(false)}><aside className="cart-drawer" onClick={(event) => event.stopPropagation()}><div className="drawer-heading"><h2>Your bag <span>{cart.length}</span></h2><button onClick={() => setCartOpen(false)}>×</button></div>{cart.length === 0 ? <div className="empty-state"><span>♧</span><p>Your bag is waiting</p><small>Add something you love.</small></div> : <>{cart.map((item, index) => <div className="cart-item" key={`${item.id}-${item.size}-${item.color}-${index}`}><img src={item.image} alt="" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_IMAGE; }} /><div><b>{item.name}</b><small>{item.category} · {item.size}{item.color ? ` · ${item.color}` : ""}</small><strong>${item.price.toFixed(2)}</strong></div><button className="cart-item-remove" aria-label={`Remove ${item.name} from bag`} onClick={() => removeFromCart(index)}>×</button></div>)}{checkoutError && <p className="auth-error">{checkoutError}</p>}<button className="checkout" disabled={checkoutLoading} onClick={checkout}>{checkoutLoading ? "Placing order..." : "Checkout"} <span>${cart.reduce((sum, item) => sum + item.price, 0).toFixed(2)}</span></button></>}</aside></div>}
      {ordersOpen && (
        <div className="drawer-backdrop" onClick={() => setOrdersOpen(false)}>
          <aside className="cart-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-heading">
              <h2>Your orders <span>{orders.length}</span></h2>
              <button onClick={() => setOrdersOpen(false)}>×</button>
            </div>
            {ordersLoading && <p className="orders-status">Loading your orders...</p>}
            {!ordersLoading && ordersError && <p className="auth-error">{ordersError}</p>}
            {!ordersLoading && !ordersError && orders.length === 0 && (
              <div className="empty-state"><span>♧</span><p>No orders yet</p><small>Your past purchases will show up here.</small></div>
            )}
            {!ordersLoading && !ordersError && orders.length > 0 && (
              <div className="orders-list">
                {orders.map((order) => (
                  <div className="order-card" key={order.id}>
                    <div className="order-card-head">
                      <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                      <span className="order-status">{order.status}</span>
                    </div>
                    {order.items.map((item) => (
                      <div className="order-line" key={`${order.id}-${item.productId}-${item.size}-${item.color}`}>
                        <span>
                          {item.quantity}× {item.name}
                          {item.size && <small> ({item.size}{item.color ? `, ${item.color}` : ""})</small>}
                        </span>
                        <span>${item.subtotal.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="order-card-total"><span>Total</span><span>${order.total.toFixed(2)}</span></div>
                  </div>
                ))}
              </div>
            )}
            {currentUser && <button className="auth-switch" onClick={logout}>Log out</button>}
          </aside>
        </div>
      )}
    </main>
  );
}
