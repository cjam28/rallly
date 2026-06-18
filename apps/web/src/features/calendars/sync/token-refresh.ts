import "server-only";

import { prisma } from "@rallly/database";
import { encrypt } from "@rallly/utils/encryption";
import { env } from "@/env";
import { loadCredential } from "@/features/credentials/queries";
import { GoogleOAuthClient } from "@/lib/oauth/providers/google";
import { ZohoOAuthClient } from "@/lib/oauth/providers/zoho";

export async function refreshOAuthTokensIfNeeded(params: {
  userId: string;
  provider: string;
  providerAccountId: string;
  credentialId: string;
}) {
  const credential = await loadCredential(params.credentialId);
  if (!credential || credential.type !== "oauth") return;

  const expiresAt = credential.expiresAt;
  const needsRefresh =
    !expiresAt || expiresAt.getTime() < Date.now() + 5 * 60 * 1000;

  if (!needsRefresh || !credential.secret.refreshToken) return;

  let refreshed: Awaited<ReturnType<GoogleOAuthClient["refreshAccessToken"]>>;
  if (params.provider === "google") {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return;
    const client = new GoogleOAuthClient({
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackUrl: "",
      scopes: [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/calendar.events",
      ],
    });
    refreshed = await client.refreshAccessToken(credential.secret.refreshToken);
  } else if (params.provider === "zoho") {
    if (!env.ZOHO_CLIENT_ID || !env.ZOHO_CLIENT_SECRET) return;
    const client = new ZohoOAuthClient({
      clientId: env.ZOHO_CLIENT_ID,
      clientSecret: env.ZOHO_CLIENT_SECRET,
      dc: env.ZOHO_DC ?? "com",
      callbackUrl: "",
    });
    refreshed = await client.refreshAccessToken(credential.secret.refreshToken);
  } else {
    return;
  }

  await prisma.credential.update({
    where: {
      user_provider_account_unique: {
        userId: params.userId,
        provider: params.provider,
        providerAccountId: params.providerAccountId,
      },
    },
    data: {
      secret: encrypt(JSON.stringify(refreshed), env.SECRET_PASSWORD),
      scopes: refreshed.scopes,
      expiresAt: refreshed.expiresAt,
    },
  });
}
