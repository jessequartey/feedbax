/** Providers return a recommendation. Policy decides whether to hold or reject it. */
export type ModerationResult = {
  verdict: "allow" | "flag" | "block";
  reasons: string[];
};
export interface ModerationProvider {
  check(text: string, signal?: AbortSignal): ModerationResult | Promise<ModerationResult>;
}
