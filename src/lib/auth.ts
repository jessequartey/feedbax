import { User } from "@/types/auth";

const USER_COOKIE_KEY = "feedbax_user";

/**
 * Set user data in cookies
 * @param user - User data to store
 */
export function setUserCookie(user: User): void {
  if (typeof window === "undefined") return;

  const userData = JSON.stringify(user);
  // Set cookie with 30 days expiration
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + 30);

  document.cookie = `${USER_COOKIE_KEY}=${encodeURIComponent(
    userData
  )}; expires=${expirationDate.toUTCString()}; path=/; SameSite=Lax`;
}

/**
 * Get user data from cookies
 * @returns User data or null if not found
 */
export function getUserCookie(): User | null {
  if (typeof window === "undefined") return null;

  const cookies = document.cookie.split(";");
  const userCookie = cookies.find((cookie) =>
    cookie.trim().startsWith(`${USER_COOKIE_KEY}=`)
  );

  if (!userCookie) return null;

  try {
    const userData = decodeURIComponent(userCookie.split("=")[1]);
    return JSON.parse(userData) as User;
  } catch (error) {
    console.error("Error parsing user cookie:", error);
    return null;
  }
}

/**
 * Clear user data from cookies (logout)
 */
export function clearUserCookie(): void {
  if (typeof window === "undefined") return;

  document.cookie = `${USER_COOKIE_KEY}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
}

/**
 * Check if user is authenticated
 * @returns boolean indicating if user is logged in
 */
export function isAuthenticated(): boolean {
  return getUserCookie() !== null;
}

/**
 * Get the user cookie key for server-side access
 */
export function getUserCookieKey(): string {
  return USER_COOKIE_KEY;
}
