import { createDAVClient } from "tsdav";
import type { CalDAVCredentials } from "@/features/calendars/services/caldav-calendar";

/**
 * Normalize a CalDAV server URL: trim, ensure https, strip trailing slashes.
 */
export function normalizeCalDAVServerUrl(raw: string): string {
  let url = raw.trim();
  if (!url) {
    throw new Error("Server URL is required");
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url.replace(/\/+$/, "");
}

export function isZohoCalDAVHost(hostname: string): boolean {
  return /^calendar\.zoho\./i.test(hostname);
}

/**
 * Candidate server URLs to try for CalDAV service discovery (tsdav principal lookup).
 */
export function getCalDAVServerUrlCandidates(
  normalizedUrl: string,
  username?: string,
): string[] {
  const parsed = new URL(
    normalizedUrl.includes("://") ? normalizedUrl : `https://${normalizedUrl}`,
  );
  const origin = parsed.origin;
  const candidates: string[] = [];

  if (parsed.pathname && parsed.pathname !== "/") {
    candidates.push(normalizedUrl);
  }

  if (isZohoCalDAVHost(parsed.hostname)) {
    candidates.push(`${origin}/.well-known/caldav`, `${origin}/caldav`, origin);
    if (username) {
      candidates.push(`${origin}/caldav/${encodeURIComponent(username)}`);
    }
  } else {
    candidates.push(normalizedUrl, `${origin}/.well-known/caldav`, origin);
  }

  return [...new Set(candidates)];
}

export type CalDAVClient = Awaited<ReturnType<typeof createDAVClient>>;

function isAuthError(message: string): boolean {
  return (
    message.includes("Invalid credentials") ||
    message.includes("401 Unauthorized")
  );
}

export function formatCalDAVConnectError(
  error: Error,
  serverUrl: string,
  username: string,
): Error {
  try {
    const parsed = new URL(serverUrl);
    if (isZohoCalDAVHost(parsed.hostname)) {
      const dcMatch = parsed.hostname.match(/^calendar\.zoho\.(.+)$/i);
      const dc = dcMatch?.[1] ?? "com";
      const hint = `Use CalDAV server URL https://calendar.zoho.${dc}/.well-known/caldav with username ${username} and an app-specific password if 2FA is enabled.`;
      return new Error(`${hint} (${error.message})`);
    }
  } catch {
    // fall through
  }
  return error;
}

/**
 * Try CalDAV discovery across candidate URLs; returns a working tsdav client and URL.
 */
export async function createCalDAVClientWithDiscovery(
  credentials: Pick<CalDAVCredentials, "serverUrl" | "username" | "password">,
): Promise<{ client: CalDAVClient; resolvedServerUrl: string }> {
  const normalizedUrl = normalizeCalDAVServerUrl(credentials.serverUrl);
  const candidates = getCalDAVServerUrlCandidates(
    normalizedUrl,
    credentials.username,
  );

  let lastError: Error | undefined;

  for (const serverUrl of candidates) {
    try {
      const client = await createDAVClient({
        serverUrl,
        credentials: {
          username: credentials.username,
          password: credentials.password,
        },
        authMethod: "Basic",
        defaultAccountType: "caldav",
      });
      await client.fetchCalendars();
      return { client, resolvedServerUrl: serverUrl };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      if (isAuthError(error.message)) {
        throw formatCalDAVConnectError(
          error,
          normalizedUrl,
          credentials.username,
        );
      }
      lastError = error;
    }
  }

  throw formatCalDAVConnectError(
    lastError ?? new Error("cannot find principalUrl"),
    normalizedUrl,
    credentials.username,
  );
}
