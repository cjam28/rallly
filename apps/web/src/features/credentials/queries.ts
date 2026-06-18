import { prisma } from "@rallly/database";
import { decrypt } from "@rallly/utils/encryption";
import { env } from "@/env";
import { CalDAVCalendarService } from "@/features/calendars/services/caldav-calendar";
import type { OAuthCredentials } from "@/features/credentials/schema";
import { oauthCredentialsSchema } from "@/features/credentials/schema";

interface BaseCredentialsInfo {
  id: string;
  provider: string;
}

interface OAuthCredentialsInfo extends BaseCredentialsInfo {
  type: "oauth";
  secret: OAuthCredentials;
  scopes: string[];
  expiresAt: Date | undefined;
}

interface CalDAVCredentialsInfo extends BaseCredentialsInfo {
  type: "caldav";
  secret: ReturnType<typeof CalDAVCalendarService.credentialsSchema.parse>;
}

type CredentialsInfo = OAuthCredentialsInfo | CalDAVCredentialsInfo;

export type { CredentialsInfo };

export const loadCredential = async (
  credentialId: string,
): Promise<CredentialsInfo | null> => {
  const credential = await prisma.credential.findUnique({
    where: {
      id: credentialId,
    },
  });

  if (!credential) {
    return null;
  }

  switch (credential.type) {
    case "OAUTH":
      return {
        id: credential.id,
        type: "oauth",
        provider: credential.provider,
        secret: oauthCredentialsSchema.parse(
          JSON.parse(decrypt(credential.secret, env.SECRET_PASSWORD)),
        ),
        scopes: credential.scopes,
        expiresAt: credential.expiresAt ?? undefined,
      };
    case "CALDAV":
      return {
        id: credential.id,
        type: "caldav",
        provider: credential.provider,
        secret: CalDAVCalendarService.credentialsSchema.parse(
          JSON.parse(decrypt(credential.secret, env.SECRET_PASSWORD)),
        ),
      };
    default:
      return null;
  }
};
