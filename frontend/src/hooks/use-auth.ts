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