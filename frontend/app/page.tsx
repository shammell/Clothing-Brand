"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  authenticatedFetch,
  extractErrorMessage,
  getAuthServerSnapshot,
  getAuthTokenSnapshot,
  getCurrentUserSnapshot,
  subscribeToStorage,
  writeAuth,
} from "@/lib/auth-store";
import {
  FALLBACK_IMAGE,
  type Product,
  getCartServerSnapshot,
  getCartSnapshot,
  getWishlistServerSnapshot,
  getWishlistSnapshot,
  productFromApi,
  toggleWishlist,
  writeCart,
} from "@/lib/shop-store";
import { useAddToCart } from "@/lib/useAddToCart";

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

type ShippingAddressForm = {
  fullName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
};

const EMPTY_SHIPPING_ADDRESS: ShippingAddressForm = {
  fullName: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
  phone: "",
};
const REQUIRED_SHIPPING_FIELDS: Array<keyof ShippingAddressForm> = [
  "fullName",
  "addressLine1",
  "city",
  "state",
  "postalCode",
  "country",
];

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

const ORDER_STEPS = ["placed", "processing", "shipped", "delivered"] as const;

function OrderTracker({ status }: { status: string }) {
  if (status === "cancelled") {
    return <p className="order-tracker-cancelled">Cancelled</p>;
  }
  const currentIndex = ORDER_STEPS.indexOf(status as (typeof ORDER_STEPS)[number]);
  return (
    <div className="order-tracker">
      {ORDER_STEPS.map((step, index) => (
        <div key={step} className={index <= currentIndex ? "order-step done" : "order-step"}>
          <span className="order-step-dot" />
          <small>{step}</small>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<Product[]>(products);
  const cart = useSyncExternalStore(subscribeToStorage, getCartSnapshot, getCartServerSnapshot);
  const [cartOpen, setCartOpen] = useState(false);
  const { getSelection, selectSize, selectColor, setQuantity, addToCart, addStatus, sizeErrors } = useAddToCart();
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
  const [shippingAddress, setShippingAddress] = useState<ShippingAddressForm>(EMPTY_SHIPPING_ADDRESS);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [orderConfirmation, setOrderConfirmation] = useState<{ id: string; total: number } | null>(null);
  // Persists across retries of the same checkout attempt (a dropped
  // response, a double-click) so the backend can recognize a resend and
  // return the order it already placed instead of creating a second one -
  // cleared only once an order actually succeeds, so the next checkout
  // attempt gets a fresh key. A ref, not state: it's never read during
  // render, so it doesn't need to survive SSR.
  const checkoutIdempotencyKeyRef = useRef<string | null>(null);

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

  const removeFromCart = (index: number) => {
    writeCart(cart.filter((_, cartIndex) => cartIndex !== index));
  };

  const updateCartQuantity = (index: number, delta: number) => {
    const line = cart[index];
    if (!line) return;
    const nextQuantity = line.quantity + delta;
    if (nextQuantity <= 0) {
      removeFromCart(index);
      return;
    }
    const ceiling = line.stock && line.stock > 0 ? Math.min(line.stock, 20) : 20;
    writeCart(
      cart.map((item, cartIndex) =>
        cartIndex === index ? { ...item, quantity: Math.min(nextQuantity, ceiling) } : item,
      ),
    );
  };

  const updateShippingField = (field: keyof ShippingAddressForm, value: string) => {
    setShippingAddress((current) => ({ ...current, [field]: value }));
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
      writeAuth(data.access_token, data.user.username, data.user.role ?? "customer");
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

  const closeCart = () => {
    setCartOpen(false);
    setOrderConfirmation(null);
  };

  const checkout = async () => {
    if (!authToken) {
      setCheckoutError("Please log in to check out.");
      setCartOpen(false);
      setAuthOpen(true);
      return;
    }
    if (!cart.length) return;
    const missingField = REQUIRED_SHIPPING_FIELDS.find((field) => !shippingAddress[field].trim());
    if (missingField) {
      setCheckoutError("Please fill in your shipping address before checking out.");
      return;
    }
    setCheckoutError("");
    setCheckoutLoading(true);
    try {
      const items = cart.map((item) => ({
        product_id: item.id,
        quantity: item.quantity,
        size: item.size,
        color: item.color,
      }));
      if (!checkoutIdempotencyKeyRef.current) {
        checkoutIdempotencyKeyRef.current = crypto.randomUUID();
      }
      const response = await authenticatedFetch(`${API_BASE}/orders/`, authToken, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": checkoutIdempotencyKeyRef.current },
        body: JSON.stringify({
          items,
          shipping_address: {
            full_name: shippingAddress.fullName.trim(),
            address_line1: shippingAddress.addressLine1.trim(),
            address_line2: shippingAddress.addressLine2.trim() || null,
            city: shippingAddress.city.trim(),
            state: shippingAddress.state.trim(),
            postal_code: shippingAddress.postalCode.trim(),
            country: shippingAddress.country.trim(),
            phone: shippingAddress.phone.trim() || null,
          },
        }),
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
      setShippingAddress(EMPTY_SHIPPING_ADDRESS);
      setOrderConfirmation({ id: data.id, total: data.total });
      checkoutIdempotencyKeyRef.current = null;
      if (authToken) fetchOrders(authToken);
    } catch {
      setCheckoutError("Could not connect to the server.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

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
            ♧ <b>{cartCount}</b>
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
                <Link href={`/products/${product.id}`}>
                  <img
                    src={product.image}
                    alt={product.name}
                    onError={(event) => {
                      event.currentTarget.onerror = null;
                      event.currentTarget.src = FALLBACK_IMAGE;
                    }}
                  />
                </Link>
                <button
                  className={wishlist.includes(product.id) ? "heart active" : "heart"}
                  aria-label={wishlist.includes(product.id) ? `Remove ${product.name} from saved` : `Save ${product.name}`}
                  aria-pressed={wishlist.includes(product.id)}
                  onClick={() => toggleWishlist(wishlist, product.id)}
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
                <div>
                  <h3><Link href={`/products/${product.id}`}>{product.name}</Link></h3>
                  <p>{product.category}</p>
                </div>
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
              <div className="quantity-row">
                <button type="button" aria-label={`Decrease quantity for ${product.name}`} onClick={() => setQuantity(product, getSelection(product).quantity - 1)}>−</button>
                <span>{getSelection(product).quantity}</span>
                <button type="button" aria-label={`Increase quantity for ${product.name}`} onClick={() => setQuantity(product, getSelection(product).quantity + 1)}>+</button>
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
      {cartOpen && (
        <div className="drawer-backdrop" onClick={closeCart}>
          <aside className="cart-drawer" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-heading">
              <h2>Your bag <span>{cartCount}</span></h2>
              <button onClick={closeCart}>×</button>
            </div>
            {orderConfirmation ? (
              <div className="empty-state">
                <span>✓</span>
                <p>Order confirmed!</p>
                <small>Order #{orderConfirmation.id.slice(-6).toUpperCase()} · ${orderConfirmation.total.toFixed(2)}</small>
                <button className="checkout" onClick={closeCart}>Continue shopping</button>
              </div>
            ) : cart.length === 0 ? (
              <div className="empty-state"><span>♧</span><p>Your bag is waiting</p><small>Add something you love.</small></div>
            ) : (
              <>
                {cart.map((item, index) => (
                  <div className="cart-item" key={`${item.id}-${item.size}-${item.color}-${index}`}>
                    <img src={item.image} alt="" onError={(event) => { event.currentTarget.onerror = null; event.currentTarget.src = FALLBACK_IMAGE; }} />
                    <div>
                      <b>{item.name}</b>
                      <small>{item.category} · {item.size}{item.color ? ` · ${item.color}` : ""}</small>
                      <div className="cart-item-qty">
                        <button type="button" aria-label={`Decrease quantity for ${item.name}`} onClick={() => updateCartQuantity(index, -1)}>−</button>
                        <span>{item.quantity}</span>
                        <button type="button" aria-label={`Increase quantity for ${item.name}`} onClick={() => updateCartQuantity(index, 1)}>+</button>
                      </div>
                      <strong>${(item.price * item.quantity).toFixed(2)}</strong>
                    </div>
                    <button className="cart-item-remove" aria-label={`Remove ${item.name} from bag`} onClick={() => removeFromCart(index)}>×</button>
                  </div>
                ))}
                <div className="shipping-form">
                  <p className="eyebrow">Shipping address</p>
                  <input placeholder="Full name" value={shippingAddress.fullName} onChange={(event) => updateShippingField("fullName", event.target.value)} />
                  <input placeholder="Address line 1" value={shippingAddress.addressLine1} onChange={(event) => updateShippingField("addressLine1", event.target.value)} />
                  <input placeholder="Address line 2 (optional)" value={shippingAddress.addressLine2} onChange={(event) => updateShippingField("addressLine2", event.target.value)} />
                  <div className="shipping-form-row">
                    <input placeholder="City" value={shippingAddress.city} onChange={(event) => updateShippingField("city", event.target.value)} />
                    <input placeholder="State" value={shippingAddress.state} onChange={(event) => updateShippingField("state", event.target.value)} />
                  </div>
                  <div className="shipping-form-row">
                    <input placeholder="Postal code" value={shippingAddress.postalCode} onChange={(event) => updateShippingField("postalCode", event.target.value)} />
                    <input placeholder="Country" value={shippingAddress.country} onChange={(event) => updateShippingField("country", event.target.value)} />
                  </div>
                  <input placeholder="Phone (optional)" value={shippingAddress.phone} onChange={(event) => updateShippingField("phone", event.target.value)} />
                </div>
                {checkoutError && <p className="auth-error">{checkoutError}</p>}
                <button className="checkout" disabled={checkoutLoading} onClick={checkout}>
                  {checkoutLoading ? "Placing order..." : "Checkout"} <span>${cartTotal.toFixed(2)}</span>
                </button>
              </>
            )}
          </aside>
        </div>
      )}
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
                      <span>#{order.id.slice(-6).toUpperCase()}</span>
                    </div>
                    <OrderTracker status={order.status} />
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
