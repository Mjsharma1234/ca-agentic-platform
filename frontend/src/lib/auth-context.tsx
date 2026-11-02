"use client";

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api, UNAUTHORIZED_EVENT } from "./api";
import type { AuthUser, Role } from "./types";

export type { AuthUser } from "./types";

/** Mirrors backend ROLE_HIERARCHY so the UI hides what the API would refuse (the API stays authoritative). */
export const ROLE_LEVEL: Record<string, number> = {
  CLIENT_USER: 0, ARTICLE_TRAINEE: 1, REVIEWER: 2, MANAGER: 3, SENIOR_MANAGER: 4, PARTNER: 5,
};

export function hasRole(user: AuthUser | null, minimum: Role): boolean {
  return !!user && (ROLE_LEVEL[user.role] ?? 0) >= ROLE_LEVEL[minimum];
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  login: (user: AuthUser) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  login: () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshUser = useCallback(async () => {
    const { data } = await api.getMe();
    setUser(data);
  }, []);

  // The session lives in an httpOnly cookie; ask the API who we are instead of trusting browser storage.
  useEffect(() => {
    try {
      // Purge any token/user cached by earlier builds that kept them in localStorage.
      localStorage.removeItem("ca_token");
      localStorage.removeItem("ca_user");
    } catch {
      /* storage unavailable */
    }
    refreshUser().finally(() => setIsLoading(false));
  }, [refreshUser]);

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null);
      if (window.location.pathname !== "/login") router.replace("/login");
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [router]);

  useEffect(() => {
    if (!isLoading && !user && pathname !== "/login") router.replace("/login");
  }, [isLoading, user, pathname, router]);

  const login = (next: AuthUser) => {
    setUser(next);
    const target = new URLSearchParams(window.location.search).get("next");
    router.push(target && target.startsWith("/") && !target.startsWith("//") ? target : "/");
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    router.push("/login");
  };

  return <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
