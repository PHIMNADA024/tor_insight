"use client";

import { useEffect, useState, useCallback } from "react";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;

  const raw =
    localStorage.getItem("user") ?? sessionStorage.getItem("user");

  if (!raw) return null;

  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    // Reads localStorage, which isn't available during SSR — this can only
    // run after mount, so hydrating state here (rather than lazily in
    // useState) is intentional, not an effect-avoidance smell.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUser(readStoredUser());
    setIsLoaded(true);

    // keep header in sync if login/logout happens in another tab
    function handleStorage() {
      setUser(readStoredUser());
    }

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    sessionStorage.removeItem("token");
    sessionStorage.removeItem("user");
    setUser(null);
  }, []);

  return { user, isLoaded, logout };
}