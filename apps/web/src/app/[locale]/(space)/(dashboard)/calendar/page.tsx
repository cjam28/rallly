import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CalendarDashboardView } from "@/features/calendars/components/calendar-dashboard-view";
import { getTranslation } from "@/i18n/server";
import { isFeatureEnabled } from "@/lib/feature-flags/server";

export default async function CalendarPage() {
  if (!isFeatureEnabled("calendars")) {
    notFound();
  }

  return <CalendarDashboardView />;
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslation();
  return {
    title: t("calendarTab", { defaultValue: "Calendar" }),
    description: t(
      "calendarDashboardDescription",
      "Merged view of external calendars, polls, and scheduled events",
    ),
  };
}
