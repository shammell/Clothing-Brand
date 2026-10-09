"use client";

import { useState } from "react";
import { extractErrorMessage, writeAuth } from "./auth-store";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "/api";

export function useAuthForm(mode: "login" | "register", onSuccess: () => void) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError("");
    setLoading(true);
    const endpoint = mode === "login" ? "/auth/login" : "/auth/register";
    const body = mode === "login" ? { email, password } : { username: name, email, password };
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(extractErrorMessage(data, "Authentication failed."));
        return;
      }
      writeAuth(data.access_token, data.user.username, data.user.role ?? "customer");
      setPassword("");
      onSuccess();
    } catch {
      setError("Could not connect to the server.");
    } finally {
      setLoading(false);
    }
  };

  return { name, setName, email, setEmail, password, setPassword, error, loading, submit };
}
