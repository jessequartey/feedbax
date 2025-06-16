"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getUserCookie } from "@/lib/auth";
import { AuthOverlay } from "@/components/auth/auth-overlay";

interface AuthGuardProps {
  children: React.ReactNode;
  showOverlay?: boolean; // If true, shows overlay instead of redirect
}

export function AuthGuard({ children, showOverlay = true }: AuthGuardProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const user = getUserCookie();
    const authenticated = !!user;
    setIsAuthenticated(authenticated);

    // If not authenticated and not showing overlay, redirect to auth
    if (!authenticated && !showOverlay) {
      router.push("/auth");
    }
  }, [router, showOverlay]);

  // Loading state
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // If authenticated, show children
  if (isAuthenticated) {
    return <>{children}</>;
  }

  // If not authenticated and showing overlay
  if (showOverlay) {
    return <AuthOverlay />;
  }

  // If not authenticated and not showing overlay, return null (redirect will happen)
  return null;
}
