"use client";

import "react-big-calendar/lib/css/react-big-calendar.css";
import "@/components/forms/poll-options-form/rbc-overrides.css";

import { Button } from "@rallly/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@rallly/ui/card";
import { Checkbox } from "@rallly/ui/checkbox";
import { Label } from "@rallly/ui/label";
import Link from "next/link";
import * as React from "react";
import { Calendar } from "react-big-calendar";
import { formatLastSynced } from "@/app/[locale]/(space)/settings/calendars/components/format-last-synced";
import dayjsLocalizer from "@/components/forms/poll-options-form/dayjs-localizer";
import { Trans, useTranslation } from "@/i18n/client";
import { dayjs } from "@/lib/dayjs";
import { trpc } from "@/trpc/client";

const localizer = dayjsLocalizer(dayjs);

function weekRange(date = new Date()) {
  const start = dayjs(date).startOf("week");
  const end = dayjs(date).endOf("week");
  return {
    startDate: start.format("YYYY-MM-DD"),
    endDate: end.format("YYYY-MM-DD"),
    anchor: date,
  };
}

export function CalendarDashboardView() {
  const { t } = useTranslation();
  const [anchorDate, setAnchorDate] = React.useState(new Date());
  const [includeExternal, setIncludeExternal] = React.useState(true);
  const [includePolls, setIncludePolls] = React.useState(true);
  const [includeEvents, setIncludeEvents] = React.useState(true);

  const range = React.useMemo(() => weekRange(anchorDate), [anchorDate]);

  const { data, isLoading } = trpc.calendars.dashboard.useQuery({
    startDate: range.startDate,
    endDate: range.endDate,
  });

  const events = React.useMemo(() => {
    if (!data) return [];

    const items: Array<{
      id: string;
      title: string;
      start: Date;
      end: Date;
      resource: string;
    }> = [];

    if (includeExternal) {
      for (const evt of data.cachedEvents) {
        items.push({
          id: evt.id,
          title: evt.summary ?? "Busy",
          start: new Date(evt.startTime),
          end: new Date(evt.endTime),
          resource: "external",
        });
      }
    }

    if (includePolls) {
      for (const opt of data.pollOptions) {
        items.push({
          id: opt.id,
          title: opt.poll.title,
          start: new Date(opt.startTime),
          end: dayjs(opt.startTime).add(opt.duration, "minute").toDate(),
          resource: "poll",
        });
      }
    }

    if (includeEvents) {
      for (const evt of data.scheduledEvents) {
        items.push({
          id: evt.id,
          title: evt.title,
          start: new Date(evt.start),
          end: new Date(evt.end),
          resource: "scheduled",
        });
      }
    }

    return items;
  }, [data, includeEvents, includeExternal, includePolls]);

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>
            <Trans i18nKey="calendarTab" defaults="Calendar" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="filter-external"
                checked={includeExternal}
                onCheckedChange={(v) => setIncludeExternal(Boolean(v))}
              />
              <Label htmlFor="filter-external">
                <Trans i18nKey="calendarFilterExternal" defaults="External" />
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="filter-polls"
                checked={includePolls}
                onCheckedChange={(v) => setIncludePolls(Boolean(v))}
              />
              <Label htmlFor="filter-polls">
                <Trans i18nKey="calendarFilterPolls" defaults="Polls" />
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="filter-events"
                checked={includeEvents}
                onCheckedChange={(v) => setIncludeEvents(Boolean(v))}
              />
              <Label htmlFor="filter-events">
                <Trans i18nKey="calendarFilterEvents" defaults="Events" />
              </Label>
            </div>
            <Button type="button" variant="ghost">
              <Link href="/settings/calendars">
                <Trans i18nKey="manageCalendars" defaults="Manage calendars" />
              </Link>
            </Button>
          </div>

          {data?.syncStates?.some((s) => s.lastStatus === "error") ? (
            <ul className="space-y-1 text-xs">
              {data.syncStates
                .filter((s) => s.lastStatus === "error")
                .map((s) => (
                  <li key={s.sourceId} className="text-destructive">
                    <Trans
                      i18nKey="calendarSyncFailed"
                      defaults="Sync failed — check settings"
                    />
                    {s.lastError ? `: ${s.lastError}` : ""}
                    <span className="text-muted-foreground">
                      {" "}
                      (
                      <Trans
                        i18nKey="lastSyncedAt"
                        defaults="Last synced: {time}"
                        values={{
                          time: formatLastSynced(
                            s.lastSyncAt,
                            t("neverSynced", { defaultValue: "Never" }),
                          ),
                        }}
                      />
                      )
                    </span>
                  </li>
                ))}
            </ul>
          ) : null}

          <div className="h-[600px]">
            {isLoading ? (
              <p className="text-muted-foreground text-sm">
                <Trans i18nKey="loading" defaults="Loading…" />
              </p>
            ) : (
              <Calendar
                localizer={localizer}
                events={events}
                defaultView="week"
                views={["week", "day"]}
                date={anchorDate}
                onNavigate={setAnchorDate}
                style={{ height: "100%" }}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
