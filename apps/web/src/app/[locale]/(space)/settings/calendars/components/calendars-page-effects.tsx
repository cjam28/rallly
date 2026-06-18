"use client";

import { toast } from "@rallly/ui/sonner";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useTranslation } from "@/i18n/client";
import { trpc } from "@/trpc/client";

const integrationLabels: Record<string, string> = {
  "google-calendar": "Google Calendar",
  "zoho-calendar": "Zoho Calendar",
  "outlook-calendar": "Microsoft Calendar",
};

export function CalendarsPageEffects() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { t } = useTranslation();
  const handledRef = React.useRef(false);

  React.useEffect(() => {
    const connected = searchParams.get("connected");
    const integration = searchParams.get("integration");
    const error = searchParams.get("error");

    if (!connected && !error) {
      handledRef.current = false;
      return;
    }

    if (handledRef.current) return;
    handledRef.current = true;

    if (connected === "true") {
      void utils.calendars.list.invalidate();
      void utils.calendars.getDefault.invalidate();
      const label =
        (integration && integrationLabels[integration]) || "Calendar";
      toast.success(
        t("calendarConnectedSuccess", {
          defaultValue: "{{provider}} connected successfully",
          provider: label,
        }),
      );
    } else if (error === "connection_failed") {
      toast.error(
        t("calendarConnectFailed", {
          defaultValue:
            "Could not connect your calendar. Check the provider app settings and try again.",
        }),
      );
    } else if (error === "invalid_request") {
      toast.error(
        t("calendarConnectCancelled", {
          defaultValue: "Calendar connection was cancelled or invalid.",
        }),
      );
    }

    router.replace("/settings/calendars", { scroll: false });
  }, [router, searchParams, t, utils]);

  return null;
}
