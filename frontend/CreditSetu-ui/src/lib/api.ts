/**
 * Central API base URL helper.
 *
 * In Vite dev, always use the same-origin `/api` proxy (vite.config.ts)
 * so the browser never cross-origin fetches localhost backends
 * (avoids "Failed to fetch" from CORS / Private Network Access).
 *
 * Production builds use VITE_API_BASE_URL when set.
 */
export function getApiBase(): string {
  const fromEnv = String(import.meta.env.VITE_API_BASE_URL || "").trim().replace(/\/$/, "");

  if (import.meta.env.DEV) {
    return "/api";
  }

  return fromEnv || "/api";
}

/**
 * Safely parse a fetch Response as JSON.
 * - Skips parsing for 204/205 and empty bodies
 * - Only JSON.parse when content looks like JSON / content-type says JSON
 * - Avoids "Unexpected end of JSON input" on empty proxy/error bodies
 */
export async function parseResponseJson<T = unknown>(
  res: Response
): Promise<T> {
  if (res.status === 204 || res.status === 205) {
    return {} as T;
  }

  const contentType = (res.headers.get("content-type") || "").toLowerCase();
  const text = await res.text();
  const trimmed = text.trim();

  if (!trimmed) {
    if (!res.ok) {
      throw new Error(
        `Request failed (${res.status}) with empty response. Is the API server running?`
      );
    }
    return {} as T;
  }

  const looksLikeJson =
    contentType.includes("application/json") ||
    trimmed.startsWith("{") ||
    trimmed.startsWith("[");

  if (!looksLikeJson) {
    throw new Error(
      trimmed.slice(0, 200) || `Request failed (${res.status})`
    );
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(
      `Invalid JSON response (${res.status}): ${trimmed.slice(0, 120)}`
    );
  }
}
