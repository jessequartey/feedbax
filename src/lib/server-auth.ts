import { User } from "@/types/auth";
import { cookies } from "next/headers";
import { getUserCookieKey } from "./auth";

/**
 * Get user data from cookies (server-side)
 * @returns User data or null if not found
 */
export async function getUserFromCookies(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const userCookie = cookieStore.get(getUserCookieKey());

    if (!userCookie?.value) return null;

    const userData = decodeURIComponent(userCookie.value);
    return JSON.parse(userData) as User;
  } catch (error) {
    console.error("Error parsing user cookie on server:", error);
    return null;
  }
}
