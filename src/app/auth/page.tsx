"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { setUserCookie } from "@/lib/auth";
import { User } from "@/types/auth";
import { appConfig } from "@/config";

function AuthPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isAutoAuthenticating, setIsAutoAuthenticating] = useState(false);

  useEffect(() => {
    // Get URL parameters
    const name = searchParams.get("name");
    const email = searchParams.get("email");

    // If both name and email are provided in URL, auto-authenticate
    if (name && email) {
      setIsAutoAuthenticating(true);

      const user: User = {
        name: decodeURIComponent(name),
        email: decodeURIComponent(email),
      };

      // Add a small delay to show loading state
      setTimeout(() => {
        setUserCookie(user);
        router.push("/");
      }, 1000);
      return;
    }

    // Pre-fill form with URL parameters if available
    if (name || email) {
      setFormData({
        name: name ? decodeURIComponent(name) : "",
        email: email ? decodeURIComponent(email) : "",
      });
    }
  }, [searchParams, router]);

  function validateForm() {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = "Name is required";
    }

    if (!formData.email.trim()) {
      newErrors.email = "Email is required";
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  function handleInputChange(field: string, value: string) {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({
        ...prev,
        [field]: "",
      }));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const user: User = {
        name: formData.name.trim(),
        email: formData.email.trim(),
      };

      // Set user cookie
      setUserCookie(user);

      // Redirect to home
      router.push("/");
    } catch (error) {
      console.error("Authentication error:", error);
      setErrors({ general: "An error occurred. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }

  if (isAutoAuthenticating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <h2 className="text-lg font-semibold">Authenticating...</h2>
            <p className="text-muted-foreground mt-2">
              Please wait while we log you in.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md p-6">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-foreground">
            {appConfig.auth.welcomeTitle}
          </h1>
          <p className="text-muted-foreground mt-2">
            {appConfig.auth.welcomeSubtitle}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {errors.general && (
            <div className="text-sm text-red-500 text-center p-2 bg-red-50 dark:bg-red-900/20 rounded">
              {errors.general}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              type="text"
              placeholder="Enter your full name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              disabled={isLoading}
              className={errors.name ? "border-red-500" : ""}
            />
            {errors.name && (
              <p className="text-sm text-red-500">{errors.name}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email Address</Label>
            <Input
              id="email"
              type="email"
              placeholder="Enter your email address"
              value={formData.email}
              onChange={(e) => handleInputChange("email", e.target.value)}
              disabled={isLoading}
              className={errors.email ? "border-red-500" : ""}
            />
            {errors.email && (
              <p className="text-sm text-red-500">{errors.email}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isLoading || !formData.name.trim() || !formData.email.trim()}
          >
            {isLoading ? "Signing in..." : "Continue"}
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default function AuthPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <AuthPageContent />
    </Suspense>
  );
}
