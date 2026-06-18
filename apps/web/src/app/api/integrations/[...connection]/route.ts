import { env } from "@/env";
import {
  createCalendarConnection,
  syncCalendars,
} from "@/features/calendars/mutations";
import { saveOAuthCredentials } from "@/features/credentials/mutations";
import { GoogleOAuthClient } from "@/lib/oauth/providers/google";
import { ZohoOAuthClient } from "@/lib/oauth/providers/zoho";
import { OAuthIntegration } from "@/lib/oauth/server";

type Integration = "google-calendar" | "zoho-calendar" | "outlook-calendar";

const { handler } = OAuthIntegration<Integration>({
  baseUrl: "/api/integrations",
  getIntegration: ({ integrationId, callbackUrl }) => {
    switch (integrationId) {
      case "google-calendar": {
        if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
          return null;
        }
        return new GoogleOAuthClient({
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          callbackUrl,
          scopes: [
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/userinfo.email",
            "https://www.googleapis.com/auth/userinfo.profile",
          ],
          onConnect: async ({
            userId,
            provider,
            tokens,
            providerAccountId,
            userInfo,
          }) => {
            // save credentials to database
            const credential = await saveOAuthCredentials({
              userId,
              provider,
              providerAccountId,
              tokens,
            });

            // create calendar connection
            const connection = await createCalendarConnection({
              userId,
              provider,
              integrationId,
              credentialId: credential.id,
              providerAccountId,
              userInfo,
              displayName: "Google Calendar",
            });

            await syncCalendars({ userId, connectionId: connection.id });
          },
        });
      }
      case "zoho-calendar": {
        if (!env.ZOHO_CLIENT_ID || !env.ZOHO_CLIENT_SECRET) {
          return null;
        }
        return new ZohoOAuthClient({
          clientId: env.ZOHO_CLIENT_ID,
          clientSecret: env.ZOHO_CLIENT_SECRET,
          dc: env.ZOHO_DC ?? "com",
          callbackUrl,
          onConnect: async ({
            userId,
            provider,
            tokens,
            providerAccountId,
            userInfo,
          }) => {
            const credential = await saveOAuthCredentials({
              userId,
              provider,
              providerAccountId,
              tokens,
            });

            const connection = await createCalendarConnection({
              userId,
              provider,
              integrationId,
              credentialId: credential.id,
              providerAccountId,
              userInfo,
              displayName: "Zoho Calendar",
            });

            await syncCalendars({ userId, connectionId: connection.id });
          },
        });
      }
      default:
        return null;
    }
  },
});

export const GET = handler;
export const POST = handler;
