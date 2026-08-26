import { z } from "zod";

export function isValidCommentEmail(value: unknown): value is string {
  return typeof value === "string" && z.email().safeParse(value.trim()).success;
}
