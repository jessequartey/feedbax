import * as React from "react";
import { notFound, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";

import type { ApiResult } from "@/contracts/domain";

/**
 * Loader helper: an admin server function answers a non-admin with `forbidden` or
 * `unauthenticated`. Both become the portal's ordinary "not found", so nothing hints that
 * an admin area exists. Any other failure is a real error.
 */
export async function unwrap<T>(call: Promise<ApiResult<T>>): Promise<T> {
  const result = await call;
  if (result.ok) return result.data;
  if (result.error.code === "forbidden" || result.error.code === "unauthenticated")
    throw notFound();
  throw new Error(result.error.message);
}

/**
 * Runs one admin change: toasts the outcome, refreshes the page's data, and returns the
 * result (or null on failure) so a dialog knows whether to close.
 */
export function useAdminAction() {
  const router = useRouter();
  return React.useCallback(
    async <T>(
      run: () => Promise<ApiResult<T>>,
      success: string | ((data: T) => string),
    ): Promise<T | null> => {
      let result: ApiResult<T>;
      try {
        result = await run();
      } catch {
        toast.error("Something went wrong. Please try again.");
        return null;
      }
      if (!result.ok) {
        toast.error(result.error.message || "Something went wrong. Please try again.");
        return null;
      }
      toast.success(typeof success === "function" ? success(result.data) : success);
      await router.invalidate();
      return result.data;
    },
    [router],
  );
}
