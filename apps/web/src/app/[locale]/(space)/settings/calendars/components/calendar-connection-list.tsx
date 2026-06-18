"use client";

import { Alert, AlertDescription } from "@rallly/ui/alert";
import { Badge } from "@rallly/ui/badge";
import { Button } from "@rallly/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@rallly/ui/dropdown-menu";
import { Icon } from "@rallly/ui/icon";
import { toast } from "@rallly/ui/sonner";
import { Switch } from "@rallly/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@rallly/ui/tooltip";
import {
  CalendarIcon,
  Link2Icon,
  MoreVerticalIcon,
  RefreshCcwIcon,
} from "lucide-react";
import {
  EmptyState,
  EmptyStateDescription,
  EmptyStateIcon,
  EmptyStateTitle,
} from "@/components/empty-state";
import { Spinner } from "@/components/spinner";
import { connectToCalendar } from "@/features/calendars/client";
import { CalendarProviderIcon } from "@/features/calendars/components/calendar-provider-icon";
import { Trans, useTranslation } from "@/i18n/client";
import { trpc } from "@/trpc/client";
import { formatLastSynced, maxLastSyncedAt } from "./format-last-synced";

export function CalendarConnectionList() {
  const utils = trpc.useUtils();
  const { data: connections } = trpc.calendars.list.useQuery();
  const disconnectCalendar = trpc.calendars.disconnect.useMutation({
    onSuccess: () => utils.calendars.list.invalidate(),
  });
  const syncCalendar = trpc.calendars.sync.useMutation({
    onSuccess: () => utils.calendars.list.invalidate(),
  });
  const { t } = useTranslation();
  const setCalendarSelection = trpc.calendars.setSelection.useMutation({
    onSuccess: () => utils.calendars.list.invalidate(),
  });

  if (connections === undefined) {
    return <Spinner />;
  }

  if (connections.length === 0) {
    return (
      <EmptyState>
        <EmptyStateIcon>
          <CalendarIcon />
        </EmptyStateIcon>
        <EmptyStateTitle>
          <Trans i18nKey="noCalendars" defaults="No calendars found" />
        </EmptyStateTitle>
        <EmptyStateDescription>
          <Trans
            i18nKey="noCalendarsDescription"
            defaults="Connect Google or Zoho Calendar to check conflicts when scheduling polls."
          />
        </EmptyStateDescription>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <Alert>
        <AlertDescription className="text-sm">
          <Trans
            i18nKey="calendarSyncHelp"
            defaults="Sync discovers calendars from your account. Toggle which ones to include in availability checks. If access expires, use Reconnect to sign in again."
          />
        </AlertDescription>
      </Alert>

      {connections.map((calendar) => {
        const lastSynced = maxLastSyncedAt(
          calendar.providerCalendars.map((c) => c.lastSyncedAt),
        );
        const selectedCount = calendar.providerCalendars.filter(
          (c) => c.isSelected,
        ).length;
        const isSyncing =
          syncCalendar.isPending && syncCalendar.variables?.id === calendar.id;

        return (
          <div className="space-y-4 rounded-xl border p-4" key={calendar.id}>
            <div className="flex items-start gap-x-4">
              <div className="pt-0.5">
                <CalendarProviderIcon provider={calendar.provider} size={32} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-sm">
                    {calendar.displayName}
                  </p>
                  {selectedCount === 0 ? (
                    <Badge variant="secondary">
                      <Trans
                        i18nKey="noCalendarsSelected"
                        defaults="None selected for availability"
                      />
                    </Badge>
                  ) : null}
                </div>
                <p className="text-muted-foreground text-sm">
                  {calendar.email}
                </p>
                <p className="mt-1 text-muted-foreground text-xs">
                  <Trans
                    i18nKey="lastSyncedAt"
                    defaults="Last synced: {{time}}"
                    values={{
                      time: formatLastSynced(
                        lastSynced,
                        t("neverSynced", { defaultValue: "Never" }),
                      ),
                    }}
                  />
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      loading={isSyncing}
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        toast.promise(
                          syncCalendar.mutateAsync({ id: calendar.id }),
                          {
                            loading: t("syncCalendarLoading", {
                              defaultValue: "Syncing calendar…",
                            }),
                            success: t("syncCalendarSuccess", {
                              defaultValue: "Calendar list updated",
                            }),
                            error: (err) => {
                              const message =
                                err instanceof Error
                                  ? err.message
                                  : String(err);
                              if (message.includes("reconnect_required")) {
                                return t("syncCalendarReconnectRequired", {
                                  defaultValue:
                                    "Access expired — use Reconnect to sign in again.",
                                });
                              }
                              return t("syncCalendarError", {
                                defaultValue:
                                  "There was an issue syncing your calendar",
                              });
                            },
                          },
                        );
                      }}
                    >
                      <Icon>
                        <RefreshCcwIcon />
                      </Icon>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <Trans
                      i18nKey="syncCalendar"
                      defaults="Refresh calendar list from provider"
                    />
                  </TooltipContent>
                </Tooltip>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  onClick={() => {
                    connectToCalendar(calendar.integrationId, {
                      redirectTo: "/settings/calendars",
                    });
                  }}
                >
                  <Link2Icon data-icon="inline-start" className="size-4" />
                  <Trans i18nKey="reconnectCalendar" defaults="Reconnect" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Icon>
                        <MoreVerticalIcon />
                      </Icon>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        toast.promise(
                          disconnectCalendar.mutateAsync({
                            id: calendar.id,
                          }),
                          {
                            loading: t("disconnectingCalendar", {
                              defaultValue: "Disconnecting calendar...",
                            }),
                            success: t("calendarDisconnectedSuccess", {
                              defaultValue:
                                "Calendar disconnected successfully",
                            }),
                            error: t("calendarDisconnectedError", {
                              defaultValue: "Failed to disconnect calendar",
                            }),
                          },
                        );
                      }}
                    >
                      <Trans
                        i18nKey="disconnectCalendar"
                        defaults="Disconnect calendar"
                      />
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            <hr />
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">
                <Trans
                  i18nKey="checkForConflicts"
                  defaults="Toggle which calendars to check for conflicts"
                />
              </p>
              {calendar.provider === "zoho" ? (
                <p className="text-muted-foreground text-xs">
                  <Trans
                    i18nKey="zohoSingleCalendarNote"
                    defaults="Zoho connects your whole account as one calendar. Google accounts can show multiple calendars after sync."
                  />
                </p>
              ) : null}
              <ul className="space-y-2">
                {calendar.providerCalendars.map((c) => {
                  return (
                    <li key={c.id} className="flex items-center gap-x-4">
                      <Switch
                        defaultChecked={c.isSelected}
                        onCheckedChange={(checked) => {
                          toast.promise(
                            setCalendarSelection.mutateAsync({
                              calendarId: c.id,
                              isSelected: checked,
                            }),
                            {
                              loading: t("settingCalendarSelection", {
                                defaultValue: "Updating selection...",
                              }),
                              success: t("calendarSelectionSetSuccess", {
                                defaultValue: "Calendar selection updated",
                              }),
                              error: t("calendarSelectionSetError", {
                                defaultValue: "Failed to update selection",
                              }),
                            },
                          );
                        }}
                      />
                      <span className="text-sm">{c.name}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
