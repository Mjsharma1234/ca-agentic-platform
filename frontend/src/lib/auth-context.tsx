"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { api } from "./api";

export interface AuthUser {
  id: string;
  firm_id: string;
  full_name: string;
  email: string;
  phone?: string;
  role: "PARTNER" | "SENIOR_MANAGER" | "MANAGER" | "ARTICLE_TRAINEE" | "CLIENT_USER" | string;
  membership_no?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  login: () => {},
  logout: () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Check localStorage for existing session
    if (typeof window !== "undefined") {
      const storedToken = localStorage.getItem("ca_token");
      const storedUser = localStorage.getItem("ca_user");

      if (storedToken && storedUser) {
        try {
          setToken(storedToken);
          setUser(JSON.parse(storedUser));
        } catch (e) {
          console.error("Failed to parse cached user", e);
          localStorage.removeItem("ca_token");
          localStorage.removeItem("ca_user");
        }
      } else {
        // Default to demo Partner user if none exists so users can browse without mandatory initial gate
        const defaultUser: AuthUser = {
          id: "00000000-0000-0000-0000-000000000002",
          firm_id: "00000000-0000-0000-0000-000000000001",
          full_name: "CA Amit Sharma, FCA",
          email: "partner@cafirm.in",
          phone: "+919876543210",
          role: "PARTNER",
          membership_no: "ICAI-FCA-504912"
        };
        setUser(defaultUser);
      }
      setIsLoading(false);
    }
  }, []);

  const login = (newToken: string, newUser: AuthUser) => {
    setToken(newToken);
    setUser(newUser);
    if (typeof window !== "undefined") {
      localStorage.setItem("ca_token", newToken);
      localStorage.setItem("ca_user", JSON.stringify(newUser));
    }
    router.push("/");
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    if (typeof window !== "undefined") {
      localStorage.removeItem("ca_token");
      localStorage.removeItem("ca_user");
    }
    router.push("/login");
  };

  const refreshUser = async () => {
    const { data } = await api.getMe();
    if (data) {
      setUser(data);
      if (typeof window !== "undefined") {
        localStorage.setItem("ca_user", JSON.stringify(data));
      }
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
