import { prisma } from "@rallly/database";
import { encrypt } from "@rallly/utils/encryption";
import { env } from "@/env";
import type { CalDAVCredentials } from "@/features/calendars/services/caldav-calendar";

export async function saveCalDAVCredentials({
  userId,
  providerAccountId,
  credentials,
}: {
  userId: string;
  providerAccountId: string;
  credentials: CalDAVCredentials;
}) {
  const existing = await prisma.credential.findUnique({
    where: {
      user_provider_account_unique: {
        userId,
        provider: "caldav",
        providerAccountId,
      },
    },
  });

  const secret = encrypt(JSON.stringify(credentials), env.SECRET_PASSWORD);

  if (existing) {
    return prisma.credential.update({
      where: { id: existing.id },
      data: { secret, scopes: [] },
    });
  }

  return prisma.credential.create({
    data: {
      type: "CALDAV",
      userId,
      provider: "caldav",
      providerAccountId,
      secret,
      scopes: [],
    },
  });
}

export async function loadCalDAVCredentials(credentialId: string) {
  const credential = await prisma.credential.findUnique({
    where: { id: credentialId },
  });
  if (!credential || credential.type !== "CALDAV") return null;

  const { decrypt } = await import("@rallly/utils/encryption");
  const { CalDAVCalendarService } = await import(
    "@/features/calendars/services/caldav-calendar"
  );

  const parsed = JSON.parse(decrypt(credential.secret, env.SECRET_PASSWORD));
  return CalDAVCalendarService.credentialsSchema.parse(parsed);
}
