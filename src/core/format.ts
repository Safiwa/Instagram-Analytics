const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function formatCompact(value: number | null | undefined, fallback = "—"): string {
  return typeof value === "number" ? compactFormatter.format(value) : fallback;
}

// Axis ticks need enough precision to stay distinct ("1.04M", "1.02M"), so
// they use up to three significant digits.
const axisFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumSignificantDigits: 3,
});

export function formatAxisCompact(value: number): string {
  return axisFormatter.format(value);
}

export function formatPercent(value: number | null | undefined, fallback = "—"): string {
  return typeof value === "number" ? `${value.toFixed(2)}%` : fallback;
}

export function formatDate(iso: string, includeYear = true): string {
  const date = new Date(iso);
  return includeYear ? dateFormatter.format(date) : shortDateFormatter.format(date);
}

export function instagramProfileUrl(username: string): string {
  return `https://www.instagram.com/${encodeURIComponent(username)}/`;
}
