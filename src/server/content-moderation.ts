import type { ViewerUser } from "../contracts/domain.ts";
import { checkModeration } from "../moderation/index.ts";
import { DomainError } from "./errors.ts";
import { effectiveSettings } from "./settings.ts";

export async function moderateContent(text: string, writer: ViewerUser): Promise<boolean> {
  if (writer.admin) return false;
  const result = await checkModeration(text, (await effectiveSettings()).moderation);
  if (result.verdict === "block")
    throw new DomainError(
      "invalid_input",
      "Please rephrase your feedback without profanity and try again.",
    );
  return result.verdict === "flag";
}
