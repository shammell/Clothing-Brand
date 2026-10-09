"use client";

import { useState, useSyncExternalStore } from "react";
import {
  extractErrorMessage,
  getAuthServerSnapshot,
  getAuthTokenSnapshot,
  getCurrentUserSnapshot,
  getRoleServerSnapshot,
  getRoleSnapshot,
  isListerOrAdminRole,
  subscribeToStorage,
  writeAuth,
} from "@/lib/auth-store";
import { ProductManager } from "@/components/ProductManager";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";
const inputClass = "border border-neutral-300 px-3 py-2 text-sm w-full";

export default function ListerPage() {
  const currentUser = useSyncExternalStore(subscribeToStorage, getCurrentUserSnapshot, getAuthServerSnapshot);
  const authToken = useSyncExternalStore(subscribeToStorage, getAuthTokenSnapshot, getAuthServerSnapshot);
  const role = useSyncExternalStore(subscribeToStorage, getRoleSnapshot, getRoleServerSnapshot);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  const logout = () => writeAuth("", "");

  const login = async () => {
    setLoginError("");
    setLoginLoading(true);
    try {
      const response = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await response.json();
      if (!response.ok) {
        setLoginError(extractErrorMessage(data, "Login failed."));
        return;
      }
      writeAuth(data.access_token, data.user.username, data.user.role ?? "customer");
      setLoginPassword("");
    } catch {
      setLoginError("Could not connect to the server.");
    } finally {
      setLoginLoading(false);
    }
  };

  if (!currentUser) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <form
          className="w-full max-w-sm space-y-4 bg-white p-8 shadow-sm border border-neutral-200"
          onSubmit={(event) => { event.preventDefault(); login(); }}
        >
          <h1 className="text-xl font-semibold text-neutral-900">Lister login</h1>
          <input type="email" required placeholder="Email address" value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} className={inputClass} />
          <input type="password" required placeholder="Password" value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} className={inputClass} />
          {loginError && <p className="text-sm text-red-600">{loginError}</p>}
          <button type="submit" disabled={loginLoading} className="w-full bg-neutral-900 text-white py-2 text-sm uppercase tracking-wide disabled:opacity-60">
            {loginLoading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </main>
    );
  }

  if (!isListerOrAdminRole(role)) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <div className="text-center space-y-4">
          <p className="text-neutral-700">Signed in as {currentUser}, but this account doesn&apos;t have lister access.</p>
          <button onClick={logout} className="underline text-sm">Log out</button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-50 p-6 md:p-10">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-neutral-900">Thread&amp;Co lister dashboard</h1>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-neutral-500">Signed in as {currentUser}</span>
            <button onClick={logout} className="underline">Log out</button>
          </div>
        </header>
        <ProductManager authToken={authToken} onSessionExpired={logout} />
      </div>
    </main>
  );
}
