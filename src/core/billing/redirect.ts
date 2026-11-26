// Only same-site relative paths are allowed as post-login destinations.
export function safeNext(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const path = value.trim();
  return path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\") && path.length <= 300
    ? path
    : fallback;
}
