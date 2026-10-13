"use client";

import { rateLimitMessage } from "@/lib/rate-limit";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { loadFitProfile } from "@/lib/fit-profile";
import { resolveImageUrl } from "@/lib/shop-store";
import { getUiServerSnapshot, getUiSnapshot, subscribeToUi } from "@/lib/ui-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const CHAT_STORAGE_KEY = "threadco_chat_history";

type ChatCard = { id: string; name: string; price: number; image_url: string };
type ChatMessage = { role: "user" | "assistant"; content: string; products?: ChatCard[] };

const INITIAL_CHAT_MESSAGE: ChatMessage = {
  role: "assistant",
  content: "Hi! I'm here to help you find your perfect style. What are you looking for today?",
};

function loadChatHistory(): ChatMessage[] {
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

function parseCards(value: unknown): ChatCard[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item.id === "string" && typeof item.name === "string")
    .map((item) => ({ id: item.id, name: item.name, price: Number(item.price) || 0, image_url: String(item.image_url ?? "") }));
}

// The assistant lives on every storefront page; its history is kept in
// localStorage so it survives navigation and reloads.
export function StyleAssistant() {
  const pathname = usePathname();
  const { cartOpen } = useSyncExternalStore(subscribeToUi, getUiSnapshot, getUiServerSnapshot);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  // Starts with the greeting so server and first client render agree; the
  // saved conversation is restored right after mount.
  const [history, setHistory] = useState<ChatMessage[]>([INITIAL_CHAT_MESSAGE]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; busy: boolean; retry: string } | null>(null);
  const [restored, setRestored] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // One-time restore of the saved chat after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(loadChatHistory());
    setRestored(true);
  }, []);

  useEffect(() => {
    if (restored) localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(history.slice(-20)));
  }, [history, restored]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView?.({ block: "end" });
  }, [history, loading, error, open]);

  const productId = pathname.match(/^\/products\/([^/]+)/)?.[1];
  const suggestions = productId
    ? ["What size should I get?", "What goes with this?"]
    : ["Help me find an outfit", "What's new?"];

  const send = async (text: string, alreadyShown = false) => {
    const message = text.trim();
    if (!message || loading) return;
    setInput("");
    setError(null);
    setLoading(true);
    const requestHistory = history.slice(-19).map(({ role, content }) => ({ role, content }));
    if (!alreadyShown) setHistory((current) => [...current.slice(-18), { role: "user", content: message }]);
    try {
      const fitProfile = loadFitProfile();
      const response = await fetch(`${API_BASE}/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history: requestHistory,
          ...(productId ? { product_id: productId } : {}),
          ...(fitProfile ? { fit_profile: fitProfile } : {}),
        }),
      });
      if (!response.ok) {
        const busy = response.status === 503;
        const limited = response.status === 429;
        setError({
          message: limited
            ? rateLimitMessage(response, "The style assistant")
            : busy
              ? "I'm helping a lot of people right now."
              : "Sorry, the style assistant is unavailable right now.",
          busy,
          retry: message,
        });
        return;
      }
      const data = await response.json();
      const reply = typeof data.reply === "string" ? data.reply : "Sorry, I could not understand that response.";
      setHistory((current) => [
        ...current.slice(-18),
        { role: "assistant", content: reply, products: parseCards(data.products) },
      ]);
    } catch {
      setError({ message: "Sorry, I could not connect to the style assistant.", busy: false, retry: message });
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setOpen(false);
    launcherRef.current?.focus();
  };

  if (pathname.startsWith("/admin") || pathname.startsWith("/lister")) return null;

  return (
    <>
      {!cartOpen && (
        <button
          ref={launcherRef}
          type="button"
          className="chat-fab"
          aria-expanded={open}
          aria-controls="style-assistant-panel"
          aria-label="Open style assistant"
          onClick={() => (open ? close() : setOpen(true))}
        >
          ✦ <span>Style assistant</span>
        </button>
      )}
      {open && !cartOpen && (
        <div
          id="style-assistant-panel"
          className="chat-window"
          role="dialog"
          aria-label="Thread&Co style assistant"
          onKeyDown={(event) => event.key === "Escape" && close()}
        >
          <div className="chat-header">
            <span><b>✦</b> Thread&amp;Co assistant</span>
            <button type="button" aria-label="Close style assistant" onClick={close}>×</button>
          </div>
          <div className="chat-body">
            <div className="chat-messages" aria-live="polite">
              {history.map((message, index) => (
                <div key={`${message.role}-${index}`} className="chat-turn">
                  <div className={message.role === "user" ? "user-message" : "bot-message fade-in"}>{message.content}</div>
                  {message.products && message.products.length > 0 && (
                    <div className="chat-cards">
                      {message.products.map((product) => (
                        <Link key={product.id} href={`/products/${product.id}`} className="chat-card" onClick={close}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={resolveImageUrl(product.image_url)} alt="" />
                          <span>{product.name}</span>
                          <b>${product.price.toFixed(2)}</b>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="bot-message typing" role="status" aria-label="Assistant is typing">
                  <i /><i /><i />
                </div>
              )}
              {error && (
                <div className="bot-message chat-error" role="alert">
                  {error.message}{" "}
                  <button type="button" onClick={() => send(error.retry, true)}>Try again</button>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
            <div className="chat-suggestions">
              {suggestions.map((suggestion) => (
                <button key={suggestion} type="button" onClick={() => send(suggestion)}>{suggestion}</button>
              ))}
            </div>
          </div>
          <div className="chat-input">
            <input
              ref={inputRef}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && send(input)}
              placeholder="Ask me anything..."
              aria-label="Message the style assistant"
            />
            <button type="button" aria-label="Send message" onClick={() => send(input)}>↑</button>
          </div>
        </div>
      )}
    </>
  );
}
