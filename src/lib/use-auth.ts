"use client";

import { useState, useEffect } from "react";
import { User } from "@/types/auth";
import { getUserCookie, clearUserCookie, setUserCookie } from "./auth";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get user from cookies on mount
    const userData = getUserCookie();
    setUser(userData);
    setIsLoading(false);
  }, []);

  const login = (userData: User) => {
    setUserCookie(userData);
    setUser(userData);
  };

  const logout = () => {
    clearUserCookie();
    setUser(null);
  };

  const updateUser = (userData: User) => {
    setUserCookie(userData);
    setUser(userData);
  };

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
    updateUser,
  };
}
