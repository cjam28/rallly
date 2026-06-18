"use client";

import { Alert, AlertDescription, AlertTitle } from "@rallly/ui/alert";
import { Button } from "@rallly/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@rallly/ui/card";
import { Checkbox } from "@rallly/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@rallly/ui/collapsible";
import { Input } from "@rallly/ui/input";
import { Label } from "@rallly/ui/label";
import { toast } from "@rallly/ui/sonner";
import { Switch } from "@rallly/ui/switch";
import {
  ChevronDownIcon,
  Loader2Icon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { useFormContext } from "react-hook-form";
import type { NewEventData } from "@/components/forms";
import { formatDateWithoutTz } from "@/components/forms/poll-options-form/utils";
import { useUser } from "@/components/user-provider";
import type { AvailabilityPreviewResult } from "@/features/availability/types";
import { connectToCalendar } from "@/features/calendars/client";
import { Trans, useTranslation } from "@/i18n/client";
import { trpc } from "@/trpc/client";
import { getBrowserTimeZone } from "@/utils/date-time-utils";

export interface AvailabilityPreviewState {
  result: AvailabilityPreviewResult;
  participantIds: string[];
  additionalSourceIds: string[];
}

interface CheckAvailabilitySectionProps {
  onPreviewChange: (preview: AvailabilityPreviewState | null) => void;
}

function formatDateInput(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function defaultEndDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return formatDateInput(d);
}

export function CheckAvailabilitySection({
  onPreviewChange,
}: CheckAvailabilitySectionProps) {
  const { t } = useTranslation();
  const { user } = useUser();
  const form = useFormContext<NewEventData>();
  const [open, setOpen] = React.useState(false);
  const [startDate, setStartDate] = React.useState(formatDateInput(new Date()));
  const [endDate, setEndDate] = React.useState(defaultEndDate);
  const [slotDurationMins, setSlotDurationMins] = React.useState(60);
  const [workdayStartHour, setWorkdayStartHour] = React.useState(9);
  const [workdayEndHour, setWorkdayEndHour] = React.useState(17);
  const [excludeWeekends, setExcludeWeekends] = React.useState(true);
  const [selectedParticipantIds, setSelectedParticipantIds] = React.useState<
    string[]
  >([]);
  const [selectedSourceIds, setSelectedSourceIds] = React.useState<string[]>(
    [],
  );
  const [preview, setPreview] = React.useState<AvailabilityPreviewState | null>(
    null,
  );

  const { data: connections } = trpc.availability.connections.list.useQuery();
  const { data: sources } = trpc.availability.sources.list.useQuery();
  const { data: space } = trpc.spaces.getCurrent.useQuery(undefined, {
    retry: false,
  });
  const { data: membersData } = trpc.spaces.listMembers.useQuery(undefined, {
    enabled: !!space,
    retry: false,
  });

  const previewQuery = trpc.availability.preview.useQuery(
    {
      userId: user?.id ?? "",
      participantUserIds: selectedParticipantIds,
      additionalSourceIds: selectedSourceIds,
      startDate,
      endDate,
      slotDurationMins,
      workdayStartHour,
      workdayEndHour,
      excludeWeekends,
      timeZone: form.watch("timeZone") || getBrowserTimeZone(),
    },
    { enabled: false },
  );

  const otherMembers = React.useMemo(() => {
    if (!membersData?.data || !user?.id) return [];
    return membersData.data.filter((m) => m.userId !== user.id);
  }, [membersData, user?.id]);

  const applyPreview = React.useCallback(
    (result: AvailabilityPreviewResult) => {
      if (result.slots.length === 0) {
        toast.error(
          t("availabilityNoSlots", {
            defaultValue:
              "No free slots found for the selected range and rules.",
          }),
        );
        return;
      }

      const timeZone = form.getValues("timeZone") || getBrowserTimeZone();
      form.setValue("timeZone", timeZone);
      form.setValue("duration", slotDurationMins);
      form.setValue(
        "options",
        result.slots.map((slot) => ({
          type: "timeSlot" as const,
          start: formatDateWithoutTz(new Date(slot.startISO)),
          end: formatDateWithoutTz(new Date(slot.endISO)),
        })),
      );
      form.setValue("view", "week");
      if (result.slots[0]) {
        form.setValue(
          "navigationDate",
          new Date(result.slots[0].startISO).toISOString(),
        );
      }

      const state: AvailabilityPreviewState = {
        result,
        participantIds: selectedParticipantIds,
        additionalSourceIds: selectedSourceIds,
      };
      setPreview(state);
      onPreviewChange(state);
      toast.success(
        t("availabilitySlotsApplied", {
          defaultValue: "{{count}} time slots added to your poll",
          count: result.slots.length,
        }),
      );
    },
    [
      form,
      onPreviewChange,
      selectedParticipantIds,
      selectedSourceIds,
      slotDurationMins,
      t,
    ],
  );

  const handleSuggest = async () => {
    if (!user?.id) {
      toast.error(
        t("availabilitySignInRequired", {
          defaultValue: "Sign in to check calendar availability.",
        }),
      );
      return;
    }

    const res = await previewQuery.refetch();
    if (res.error) {
      toast.error(
        t("availabilityPreviewError", {
          defaultValue: "Could not load availability. Try again.",
        }),
      );
      return;
    }
    if (res.data) {
      applyPreview(res.data);
    }
  };

  const reconnectWarnings =
    preview?.result.busyBreakdown.filter((b) => b.reconnectRequired) ?? [];

  const connectionById = React.useMemo(() => {
    const map = new Map<string, { integrationId: string; email: string }>();
    for (const conn of connections ?? []) {
      map.set(conn.id, {
        integrationId: conn.integrationId,
        email: conn.email,
      });
    }
    return map;
  }, [connections]);

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="pb-3">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-start justify-between gap-4 text-left"
            >
              <div>
                <CardTitle>
                  <Trans
                    i18nKey="checkAvailability"
                    defaults="Check availability"
                  />
                </CardTitle>
                <CardDescription>
                  <Trans
                    i18nKey="checkAvailabilityDescription"
                    defaults="Find free time slots from connected calendars and other sources"
                  />
                </CardDescription>
              </div>
              <ChevronDownIcon
                className={`mt-1 size-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-6 border-t pt-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="avail-start">
                  <Trans
                    i18nKey="availabilityStartDate"
                    defaults="Start date"
                  />
                </Label>
                <Input
                  id="avail-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="avail-end">
                  <Trans i18nKey="availabilityEndDate" defaults="End date" />
                </Label>
                <Input
                  id="avail-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="avail-duration">
                  <Trans
                    i18nKey="availabilitySlotDuration"
                    defaults="Slot duration (minutes)"
                  />
                </Label>
                <Input
                  id="avail-duration"
                  type="number"
                  min={15}
                  step={15}
                  value={slotDurationMins}
                  onChange={(e) => setSlotDurationMins(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>
                  <Trans
                    i18nKey="availabilityWorkHours"
                    defaults="Workday hours"
                  />
                </Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={23}
                    value={workdayStartHour}
                    onChange={(e) =>
                      setWorkdayStartHour(Number(e.target.value))
                    }
                    aria-label={t("availabilityWorkdayStart", {
                      defaultValue: "Workday start hour",
                    })}
                  />
                  <span className="text-muted-foreground text-sm">–</span>
                  <Input
                    type="number"
                    min={1}
                    max={24}
                    value={workdayEndHour}
                    onChange={(e) => setWorkdayEndHour(Number(e.target.value))}
                    aria-label={t("availabilityWorkdayEnd", {
                      defaultValue: "Workday end hour",
                    })}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch
                id="exclude-weekends"
                checked={excludeWeekends}
                onCheckedChange={setExcludeWeekends}
              />
              <Label htmlFor="exclude-weekends">
                <Trans
                  i18nKey="availabilityExcludeWeekends"
                  defaults="Exclude weekends"
                />
              </Label>
            </div>

            <div className="space-y-3">
              <div>
                <Label>
                  <Trans i18nKey="availabilityCalendars" defaults="Calendars" />
                </Label>
                <p className="text-muted-foreground text-sm">
                  <Trans
                    i18nKey="availabilityCalendarsHelp"
                    defaults="Your connected calendars are always included. Select co-hosts to include their calendars."
                  />
                </p>
              </div>
              {connections && connections.length > 0 ? (
                <ul className="space-y-2 rounded-lg border p-3 text-sm">
                  {connections.map((conn) => (
                    <li key={conn.id} className="text-muted-foreground">
                      {conn.displayName ?? conn.email} (
                      {conn.integrationId.replace("-calendar", "")})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted-foreground text-sm">
                  <Trans
                    i18nKey="availabilityNoConnections"
                    defaults="No calendars connected."
                  />{" "}
                  <Link
                    href="/settings/calendars"
                    className="text-primary underline"
                  >
                    <Trans
                      i18nKey="connectCalendar"
                      defaults="Connect Calendar"
                    />
                  </Link>
                </p>
              )}

              {otherMembers.length > 0 ? (
                <div className="space-y-2">
                  <Label>
                    <Trans
                      i18nKey="availabilityCoHosts"
                      defaults="Co-hosts (space members)"
                    />
                  </Label>
                  <ul className="space-y-2 rounded-lg border p-3">
                    {otherMembers.map((member) => (
                      <li
                        key={member.userId}
                        className="flex items-center gap-2"
                      >
                        <Checkbox
                          id={`participant-${member.userId}`}
                          checked={selectedParticipantIds.includes(
                            member.userId,
                          )}
                          onCheckedChange={(checked) => {
                            setSelectedParticipantIds((prev) =>
                              checked
                                ? [...prev, member.userId]
                                : prev.filter((id) => id !== member.userId),
                            );
                          }}
                        />
                        <Label
                          htmlFor={`participant-${member.userId}`}
                          className="font-normal"
                        >
                          {member.name ?? member.email}
                        </Label>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            {sources && sources.length > 0 ? (
              <div className="space-y-2">
                <Label>
                  <Trans
                    i18nKey="availabilityAdditionalSources"
                    defaults="Additional sources"
                  />
                </Label>
                <ul className="space-y-2 rounded-lg border p-3">
                  {sources.map((source) => (
                    <li key={source.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`source-${source.id}`}
                        checked={selectedSourceIds.includes(source.id)}
                        onCheckedChange={(checked) => {
                          setSelectedSourceIds((prev) =>
                            checked
                              ? [...prev, source.id]
                              : prev.filter((id) => id !== source.id),
                          );
                        }}
                      />
                      <Label
                        htmlFor={`source-${source.id}`}
                        className="font-normal"
                      >
                        {source.label}{" "}
                        <span className="text-muted-foreground">
                          ({source.type.replace("_", " ")})
                        </span>
                      </Label>
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground text-sm">
                  <Link
                    href="/settings/calendars"
                    className="text-primary underline"
                  >
                    <Trans
                      i18nKey="manageAvailabilitySources"
                      defaults="Manage availability sources"
                    />
                  </Link>
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                <Trans
                  i18nKey="availabilityNoSources"
                  defaults="Add ICS feeds, CalDAV accounts, or manual blocks in"
                />{" "}
                <Link
                  href="/settings/calendars"
                  className="text-primary underline"
                >
                  <Trans
                    i18nKey="availabilitySources"
                    defaults="Availability sources"
                  />
                </Link>
              </p>
            )}

            <Button
              type="button"
              variant="primary"
              onClick={handleSuggest}
              disabled={previewQuery.isFetching}
              className="w-full sm:w-auto"
            >
              {previewQuery.isFetching ? (
                <Loader2Icon className="mr-2 size-4 animate-spin" />
              ) : (
                <SparklesIcon className="mr-2 size-4" />
              )}
              <Trans i18nKey="suggestFreeSlots" defaults="Suggest free slots" />
            </Button>

            {preview ? (
              <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                <p className="font-medium text-sm">
                  <Trans
                    i18nKey="availabilityBreakdownTitle"
                    defaults="Busy time breakdown"
                  />
                </p>
                <ul className="space-y-2 text-sm">
                  {preview.result.busyBreakdown.map((row) => (
                    <li
                      key={row.sourceId}
                      className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2"
                    >
                      <span>{row.label}</span>
                      <span className="text-muted-foreground">
                        {row.busyWindowCount}{" "}
                        <Trans
                          i18nKey="availabilityBusyWindows"
                          defaults="busy windows"
                        />
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground text-sm">
                  <Trans
                    i18nKey="availabilitySuggestedCount"
                    defaults="{{count}} free slots suggested"
                    count={preview.result.slots.length}
                  />
                </p>
              </div>
            ) : null}

            {reconnectWarnings.length > 0 ? (
              <Alert variant="error">
                <TriangleAlertIcon />
                <AlertTitle>
                  <Trans
                    i18nKey="availabilityReconnectTitle"
                    defaults="Reconnect required"
                  />
                </AlertTitle>
                <AlertDescription>
                  <Trans
                    i18nKey="availabilityReconnectDescription"
                    defaults="Some calendars need to be reconnected before availability can be read."
                  />
                  <ul className="mt-2 list-inside list-disc">
                    {reconnectWarnings.map((w) => (
                      <li
                        key={w.sourceId}
                        className="flex flex-wrap items-center gap-2"
                      >
                        <span>{w.label}</span>
                        {connectionById.get(w.sourceId) ? (
                          <Button
                            type="button"
                            variant="default"
                            size="sm"
                            onClick={() => {
                              const conn = connectionById.get(w.sourceId);
                              if (!conn) return;
                              connectToCalendar(conn.integrationId, {
                                redirectTo: window.location.pathname,
                              });
                            }}
                          >
                            <Trans
                              i18nKey="reconnectCalendar"
                              defaults="Reconnect"
                            />
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/settings/calendars"
                    className="mt-2 inline-block underline"
                  >
                    <Trans i18nKey="calendars" defaults="Calendars" />
                  </Link>
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
