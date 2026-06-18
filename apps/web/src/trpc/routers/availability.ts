import "server-only";

import type { Prisma } from "@rallly/database";
import { prisma } from "@rallly/database";
import { TRPCError } from "@trpc/server";
import * as z from "zod";
import type { BusyMinutes } from "@/features/availability/lib/busy";
import { mergeBusy } from "@/features/availability/lib/busy";
import { generateFreeSlots } from "@/features/availability/lib/slot-generator";
import {
  createSnapshot,
  getSnapshotByPollId,
  getSnapshotByToken,
} from "@/features/availability/mutations/snapshots";
import type { AvailabilityPreviewResult } from "@/features/availability/types";
import { privateProcedure, router } from "../trpc";

const jsonRecordSchema = z.record(z.string(), z.unknown());

const availabilitySourceSchema = z.object({
  type: z.enum(["ics_url", "caldav", "manual"]),
  label: z.string().min(1),
  config: jsonRecordSchema,
});

function countBusyWindows(busy: BusyMinutes): number {
  return Object.values(busy).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
    0,
  );
}

const previewParamsSchema = z.object({
  userId: z.string(),
  participantUserIds: z.array(z.string()).default([]),
  additionalSourceIds: z.array(z.string()).default([]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slotDurationMins: z.number().int().positive(),
  workdayStartHour: z.number().int().min(0).max(23),
  workdayEndHour: z.number().int().min(1).max(24),
  excludeWeekends: z.boolean().default(true),
  timeZone: z.string(),
});

const sources = router({
  list: privateProcedure.query(async ({ ctx }) => {
    return prisma.availabilitySource.findMany({
      where: { userId: ctx.user.id },
      orderBy: { createdAt: "asc" },
    });
  }),

  create: privateProcedure
    .input(availabilitySourceSchema)
    .mutation(async ({ ctx, input }) => {
      return prisma.availabilitySource.create({
        data: {
          userId: ctx.user.id,
          type: input.type,
          label: input.label,
          config: input.config as unknown as Prisma.InputJsonValue,
        },
      });
    }),

  update: privateProcedure
    .input(
      z.object({
        id: z.string(),
        label: z.string().min(1).optional(),
        config: jsonRecordSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const source = await prisma.availabilitySource.findUnique({
        where: { id: input.id },
      });
      if (!source || source.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return prisma.availabilitySource.update({
        where: { id: input.id },
        data: {
          ...(input.label !== undefined && { label: input.label }),
          ...(input.config !== undefined && {
            config: input.config as unknown as Prisma.InputJsonValue,
          }),
        },
      });
    }),

  delete: privateProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const source = await prisma.availabilitySource.findUnique({
        where: { id: input.id },
      });
      if (!source || source.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return prisma.availabilitySource.delete({ where: { id: input.id } });
    }),
});

const connections = router({
  list: privateProcedure.query(async ({ ctx }) => {
    return prisma.calendarConnection.findMany({
      where: {
        userId: ctx.user.id,
        integrationId: { in: ["google-calendar", "zoho-calendar"] },
      },
      select: {
        id: true,
        provider: true,
        integrationId: true,
        email: true,
        displayName: true,
      },
    });
  }),
});

const snapshot = router({
  create: privateProcedure
    .input(
      z.object({
        pollId: z.string(),
        previewResult: z.object({
          slots: z.array(
            z.object({
              id: z.string(),
              startISO: z.string(),
              endISO: z.string(),
              label: z.string(),
              dateKey: z.string(),
              startMin: z.number(),
              endMin: z.number(),
            }),
          ),
          busyBreakdown: z.array(
            z.object({
              sourceId: z.string(),
              label: z.string(),
              busyWindowCount: z.number(),
              reconnectRequired: z.boolean().optional(),
            }),
          ),
        }),
        participantIds: z.array(z.string()).default([]),
        meta: jsonRecordSchema.default({}),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const poll = await prisma.poll.findUnique({
        where: { id: input.pollId },
        select: { userId: true },
      });
      if (!poll || poll.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }
      return createSnapshot({
        pollId: input.pollId,
        meta: input.meta,
        suggestedSlots: input.previewResult.slots,
        busyBreakdown: input.previewResult.busyBreakdown.map((b) => ({
          sourceId: b.sourceId,
          label: b.label,
          busyWindowCount: b.busyWindowCount,
        })),
        participantIds: input.participantIds,
      });
    }),

  get: privateProcedure
    .input(
      z.object({
        pollId: z.string().optional(),
        token: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      let snap = null;
      if (input.pollId) {
        snap = await getSnapshotByPollId(input.pollId);
      } else if (input.token) {
        snap = await getSnapshotByToken(input.token);
      }
      if (!snap) throw new TRPCError({ code: "NOT_FOUND" });

      const poll = await prisma.poll.findUnique({
        where: { id: snap.pollId },
        select: { userId: true },
      });
      if (!poll || poll.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN" });
      }

      return snap;
    }),
});

export const availability = router({
  sources,
  connections,
  snapshot,

  preview: privateProcedure
    .input(previewParamsSchema)
    .query(async ({ ctx, input }): Promise<AvailabilityPreviewResult> => {
      const {
        additionalSourceIds,
        participantUserIds,
        startDate,
        endDate,
        slotDurationMins,
        workdayStartHour,
        workdayEndHour,
        excludeWeekends,
      } = input;

      const rangeStart = new Date(`${startDate}T00:00:00Z`);
      const rangeEnd = new Date(`${endDate}T23:59:59Z`);

      const busyBreakdown: AvailabilityPreviewResult["busyBreakdown"] = [];
      const allBusy: BusyMinutes[] = [];

      // Load ICS / CalDAV / manual sources
      if (additionalSourceIds.length > 0) {
        const dbSources = await prisma.availabilitySource.findMany({
          where: {
            id: { in: additionalSourceIds },
            userId: ctx.user.id,
          },
        });

        for (const source of dbSources) {
          try {
            let busy = {};
            if (source.type === "ics_url") {
              const { fetchBusyFromIcsUrl } = await import(
                "@/features/availability/providers/ics-url"
              );
              const cfg = source.config as { url?: string };
              if (cfg.url) {
                busy = await fetchBusyFromIcsUrl(cfg.url, rangeStart, rangeEnd);
              }
            } else if (source.type === "caldav") {
              const { fetchBusyFromCalDAV } = await import(
                "@/features/availability/providers/caldav"
              );
              const cfg = source.config as {
                serverUrl?: string;
                username?: string;
                password?: string;
                calendarPath?: string;
              };
              if (cfg.serverUrl && cfg.username && cfg.password) {
                busy = await fetchBusyFromCalDAV(
                  {
                    serverUrl: cfg.serverUrl,
                    username: cfg.username,
                    password: cfg.password,
                    calendarPath: cfg.calendarPath,
                  },
                  rangeStart,
                  rangeEnd,
                );
              }
            } else if (source.type === "manual") {
              const { busyFromManualBlocks } = await import(
                "@/features/availability/lib/manual"
              );
              const cfg = source.config as {
                blocks?: Array<{ startISO: string; endISO: string }>;
              };
              busy = busyFromManualBlocks(cfg.blocks ?? []);
            }
            allBusy.push(busy);
            busyBreakdown.push({
              sourceId: source.id,
              label: source.label,
              busyWindowCount: countBusyWindows(busy as BusyMinutes),
            });
          } catch {
            busyBreakdown.push({
              sourceId: source.id,
              label: source.label,
              busyWindowCount: 0,
            });
          }
        }
      }

      // Load calendar connections for current user + selected participants
      const calendarUserIds = [
        ctx.user.id,
        ...participantUserIds.filter((id) => id !== ctx.user.id),
      ];
      const connections = await prisma.calendarConnection.findMany({
        where: {
          userId: { in: calendarUserIds },
          integrationId: { in: ["google-calendar", "zoho-calendar"] },
        },
        include: { credential: true },
      });

      if (connections.length > 0) {
        for (const conn of connections) {
          try {
            let busy = {};
            let reconnectRequired = false;

            if (conn.integrationId === "google-calendar") {
              const { fetchBusyFromGoogleCalendar } = await import(
                "@/features/availability/providers/google-calendar"
              );
              const result = await fetchBusyFromGoogleCalendar(
                conn,
                rangeStart,
                rangeEnd,
              );
              busy = result.busy;
              reconnectRequired = result.reconnectRequired ?? false;
            } else if (conn.integrationId === "zoho-calendar") {
              const { fetchBusyFromZohoCalendar } = await import(
                "@/features/availability/providers/zoho-calendar"
              );
              const result = await fetchBusyFromZohoCalendar(
                conn,
                rangeStart,
                rangeEnd,
              );
              busy = result.busy;
              reconnectRequired = result.reconnectRequired ?? false;
            }

            allBusy.push(busy);
            busyBreakdown.push({
              sourceId: conn.id,
              label: conn.displayName ?? conn.email,
              busyWindowCount: countBusyWindows(busy as BusyMinutes),
              reconnectRequired,
            });
          } catch {
            busyBreakdown.push({
              sourceId: conn.id,
              label: conn.displayName ?? conn.email,
              busyWindowCount: 0,
            });
          }
        }
      }

      const merged = mergeBusy(allBusy);
      const slots = generateFreeSlots(
        {
          startDate,
          endDate,
          slotDurationMins,
          workdayStartHour,
          workdayEndHour,
          excludeWeekends,
        },
        merged,
      );

      return { slots, busyBreakdown, mergedBusy: merged };
    }),
});
