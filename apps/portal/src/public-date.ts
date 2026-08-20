export function formatPublicDate(
  date: Date,
  month: "short" | "long" = "short",
): string {
  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month,
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
