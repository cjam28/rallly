import * as Sentry from "@sentry/nextjs";

export const onRequestError = Sentry.captureRequestError;

const SYNC_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");

    // Internal calendar sync scheduler — only in self-hosted mode and not
    // during build (NEXT_PHASE is set during `next build`).
    const isBuild = process.env.NEXT_PHASE === "phase-production-build";
    const isSelfHosted = process.env.NEXT_PUBLIC_SELF_HOSTED === "true";

    if (isSelfHosted && !isBuild) {
      // Use a module-level flag to prevent double-registration if register() is
      // called more than once (e.g. hot reload in dev).
      const g = globalThis as typeof globalThis & {
        __calendarSyncScheduled?: boolean;
      };
      if (!g.__calendarSyncScheduled) {
        g.__calendarSyncScheduled = true;

        const runSync = async () => {
          try {
            const { syncAllUsers } = await import("@/features/calendars/sync");
            await syncAllUsers();
          } catch {
            // Errors are logged inside syncAllUsers per-user; swallow here to
            // prevent crashing the scheduler loop.
          }
        };

        // First run after a short delay so the DB pool is ready.
        const timer = setTimeout(async () => {
          await runSync();
          setInterval(runSync, SYNC_INTERVAL_MS);
        }, 30_000);

        // Prevent the timer from keeping the process alive artificially.
        if (timer.unref) timer.unref();
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}
