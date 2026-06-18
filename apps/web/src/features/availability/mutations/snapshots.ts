import "server-only";

import type { Prisma } from "@rallly/database";
import { prisma } from "@rallly/database";
import type { CandidateSlot } from "../lib/slot-generator";

interface CreateSnapshotParams {
  pollId: string;
  meta: Record<string, unknown>;
  suggestedSlots: CandidateSlot[];
  busyBreakdown: Array<{
    sourceId: string;
    label: string;
    busyWindowCount: number;
  }>;
  participantIds: string[];
}

export async function createSnapshot(params: CreateSnapshotParams) {
  return prisma.availabilitySnapshot.create({
    data: {
      pollId: params.pollId,
      meta: params.meta as unknown as Prisma.InputJsonValue,
      suggestedSlots: params.suggestedSlots as unknown as Prisma.InputJsonValue,
      busyBreakdown: params.busyBreakdown as unknown as Prisma.InputJsonValue,
      participantIds: params.participantIds,
    },
  });
}

export async function getSnapshotByPollId(pollId: string) {
  return prisma.availabilitySnapshot.findUnique({
    where: { pollId },
  });
}

export async function getSnapshotByToken(token: string) {
  return prisma.availabilitySnapshot.findUnique({
    where: { token },
  });
}
