"use client";

import { useEffect, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

/** Fired after login, logout or a profile change so every useAuth() reloads. */
export const AUTH_CHANGED_EVENT = "tor-auth-changed";

export function notifyAuthChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
}

function readToken() {
  return localStorage.getItem("token") ?? sessionStorage.getItem("token");
}

// Only the session token is kept in browser storage. The user's name, email and
// role are loaded from the API and kept in memory (V14.3.3). One request is
// shared by every component that needs the user.
let cached: { token: string; user: Promise<AuthUser | null> } | null = null;

function loadUser(token: string): Promise<AuthUser | null> {
  if (cached?.token === token) return cached.user;

  const user = fetch(`${API_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then(async (res) => {
      if (res.status === 401 || res.status === 403) {
        // The session is no longer valid: forget it.
        localStorage.removeItem("token");
        sessionStorage.removeItem("token");
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json();
      return (data.user ?? null) as AuthUser | null;
    })
    .catch(() => null);

  cached = { token, user };
  return user;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    // Remove user details that older versions stored next to the token.
    localStorage.removeItem("user");
    sessionStorage.removeItem("user");

    async function refresh() {
      const token = readToken();
      const loaded = token ? await loadUser(token) : null;
      if (!active) return;
      setUser(loaded);
      setIsLoaded(true);
    }

    function handleChange() {
      cached = null;
      void refresh();
    }

    void refresh();

    // keep in sync if login/logout happens in this tab or another one
    window.addEventListener(AUTH_CHANGED_EVENT, handleChange);
    window.addEventListener("storage", handleChange);
    return () => {
      active = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, handleChange);
      window.removeEventListener("storage", handleChange);
    };
  }, []);

  const logout = useCallback(async () => {
    const token = localStorage.getItem("token") ?? sessionStorage.getItem("token");
    if (token) {
      try {
        await fetch(`${API_URL}/api/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(3_000),
        });
      } catch {
        // Local logout still proceeds if the browser cannot start the request.
      }
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    cached = null;
    setUser(null);
    notifyAuthChanged();
  }, []);

  return { user, isLoaded, logout };
}

export function handleAuthError(status: number, message: string) {
    if (status === 401 || status === 403) {
        let displayMessage = null;

        if (message?.includes("disabled")) {
            displayMessage = "บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบเพื่อขอความช่วยเหลือ";
        } else if (message?.includes("Invalid or expired token")) {
            displayMessage = "เซสชันของคุณหมดอายุหรือบัญชีไม่พร้อมใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง";
        }

        if (displayMessage) {
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            sessionStorage.removeItem("token");
            sessionStorage.removeItem("user");
            sessionStorage.setItem("authErrorMessage", displayMessage);
            return true;
        }
    }
    return false;
}