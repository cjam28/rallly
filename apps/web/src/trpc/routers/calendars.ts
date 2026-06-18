import { TRPCError } from "@trpc/server";
import * as z from "zod";
import {
  connectCalDAV,
  disconnectCalendarConnection,
  setCalendarSelection,
  setDefaultCalendar,
  syncCalendars,
} from "@/features/calendars/mutations";
import {
  getCalendarDashboardData,
  getCalendars,
  getDefaultCalendar,
} from "@/features/calendars/queries";
import { isFeatureEnabled } from "@/lib/feature-flags/server";
import { privateProcedure, router, spaceProcedure } from "../trpc";

export const calendars = router({
  list: privateProcedure.query(async ({ ctx }) => {
    return getCalendars(ctx.user.id);
  }),
  disconnect: privateProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return disconnectCalendarConnection(ctx.user.id, input.id);
    }),
  sync: privateProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await syncCalendars({
        userId: ctx.user.id,
        connectionId: input.id,
      });

      if (!result.success) {
        if (result.error === "reconnect_required") {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "reconnect_required",
          });
        }
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: result.error,
        });
      }

      return result;
    }),
  getDefault: privateProcedure.query(async ({ ctx }) => {
    return getDefaultCalendar(ctx.user.id);
  }),
  setDefault: privateProcedure
    .input(z.object({ calendarId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      return setDefaultCalendar({
        userId: ctx.user.id,
        calendarId: input.calendarId,
      });
    }),
  setSelection: privateProcedure
    .input(
      z.object({
        calendarId: z.string(),
        isSelected: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return setCalendarSelection({
        userId: ctx.user.id,
        calendarId: input.calendarId,
        isSelected: input.isSelected,
      });
    }),
  connectCalDAV: privateProcedure
    .input(
      z.object({
        serverUrl: z.string().url(),
        username: z.string().min(1),
        password: z.string().min(1),
        calendarPath: z.string().optional(),
        displayName: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return connectCalDAV({
        userId: ctx.user.id,
        ...input,
      });
    }),
  dashboard: spaceProcedure
    .input(
      z.object({
        startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (!isFeatureEnabled("calendars")) {
        throw new TRPCError({ code: "NOT_FOUND" });
      }

      const rangeStart = new Date(`${input.startDate}T00:00:00`);
      const rangeEnd = new Date(`${input.endDate}T23:59:59`);

      return getCalendarDashboardData({
        userId: ctx.user.id,
        spaceId: ctx.space.id,
        rangeStart,
        rangeEnd,
      });
    }),
});
