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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@rallly/ui/select";
import { toast } from "@rallly/ui/sonner";
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

const ZOHO_CATEGORY_ORDER = ["own", "app", "group", "others"] as const;
type ZohoCategory = (typeof ZOHO_CATEGORY_ORDER)[number];

const ZOHO_CATEGORY_I18N: Record<ZohoCategory, string> = {
  own: "zohoCalendarCategoryOwn",
  app: "zohoCalendarCategoryApp",
  group: "zohoCalendarCategoryGroup",
  others: "zohoCalendarCategoryOthers",
};

type SyncMode = "none" | "display" | "availability";

function getZohoCategory(providerData: unknown): ZohoCategory {
  const data = providerData as { category?: string; caltype?: string } | null;
  const raw = data?.category ?? data?.caltype ?? "own";
  if (raw === "own" || raw === "app" || raw === "group" || raw === "others") {
    return raw;
  }
  return "others";
}

function isProviderDisabled(providerData: unknown): boolean {
  const data = providerData as {
    status?: boolean;
    providerDisabled?: boolean;
  } | null;
  return data?.providerDisabled === true || data?.status === false;
}

type ProviderCalendar = {
  id: string;
  name: string;
  syncMode: string | null;
  providerData: unknown;
};

function groupZohoCalendars<T extends ProviderCalendar>(
  calendars: T[],
): Array<{ category: ZohoCategory; calendars: T[] }> {
  const buckets = new Map<ZohoCategory, T[]>();
  for (const category of ZOHO_CATEGORY_ORDER) {
    buckets.set(category, []);
  }
  for (const calendar of calendars) {
    const category = getZohoCategory(calendar.providerData);
    buckets.get(category)?.push(calendar);
  }
  return ZOHO_CATEGORY_ORDER.flatMap((category) => {
    const items = buckets.get(category) ?? [];
    return items.length > 0 ? [{ category, calendars: items }] : [];
  });
}

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
  const setSyncMode = trpc.calendars.setSyncMode.useMutation({
    onSuccess: () => utils.calendars.list.invalidate(),
  });
  const setSyncModeBulk = trpc.calendars.setSyncModeBulk.useMutation({
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
          (c) => c.syncMode !== "none",
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
                    i18nKey="zohoMultiCalendarNote"
                    defaults="After reconnecting, sync discovers individual Zoho calendars you can toggle."
                  />
                </p>
              ) : null}
              {calendar.provider === "zoho" ? (
                <div className="max-h-[min(24rem,50vh)] space-y-4 overflow-y-auto pr-1">
                  {groupZohoCalendars(calendar.providerCalendars).map(
                    ({ category, calendars: groupCalendars }) => (
                      <div key={category} className="space-y-2">
                        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                          <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
                            <Trans
                              i18nKey={ZOHO_CATEGORY_I18N[category]}
                              defaults={
                                category === "own"
                                  ? "My calendars"
                                  : category === "app"
                                    ? "App calendars"
                                    : category === "group"
                                      ? "Group calendars"
                                      : "Subscribed & other"
                              }
                            />
                          </p>
                          <div className="flex flex-wrap gap-1">
                            <BulkSyncModeButton
                              label={t("bulkSyncModeAvailability", {
                                defaultValue: "All: availability",
                              })}
                              loading={
                                setSyncModeBulk.isPending &&
                                setSyncModeBulk.variables?.connectionId ===
                                  calendar.id &&
                                setSyncModeBulk.variables?.syncMode ===
                                  "availability"
                              }
                              onClick={() =>
                                applyBulkSyncMode({
                                  connectionId: calendar.id,
                                  calendarIds: groupCalendars.map((c) => c.id),
                                  syncMode: "availability",
                                  setSyncModeBulk,
                                  t,
                                })
                              }
                            />
                            <BulkSyncModeButton
                              label={t("bulkSyncModeDisplay", {
                                defaultValue: "All: display only",
                              })}
                              loading={
                                setSyncModeBulk.isPending &&
                                setSyncModeBulk.variables?.connectionId ===
                                  calendar.id &&
                                setSyncModeBulk.variables?.syncMode ===
                                  "display"
                              }
                              onClick={() =>
                                applyBulkSyncMode({
                                  connectionId: calendar.id,
                                  calendarIds: groupCalendars.map((c) => c.id),
                                  syncMode: "display",
                                  setSyncModeBulk,
                                  t,
                                })
                              }
                            />
                            <BulkSyncModeButton
                              label={t("bulkSyncModeNone", {
                                defaultValue: "All: don't sync",
                              })}
                              loading={
                                setSyncModeBulk.isPending &&
                                setSyncModeBulk.variables?.connectionId ===
                                  calendar.id &&
                                setSyncModeBulk.variables?.syncMode === "none"
                              }
                              onClick={() =>
                                applyBulkSyncMode({
                                  connectionId: calendar.id,
                                  calendarIds: groupCalendars.map((c) => c.id),
                                  syncMode: "none",
                                  setSyncModeBulk,
                                  t,
                                })
                              }
                            />
                          </div>
                        </div>
                        <ul className="space-y-2">
                          {groupCalendars.map((c) =>
                            renderCalendarRow(c, setSyncMode, t),
                          )}
                        </ul>
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <ul className="space-y-2">
                  {calendar.providerCalendars.map((c) =>
                    renderCalendarRow(c, setSyncMode, t),
                  )}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BulkSyncModeButton({
  label,
  loading,
  onClick,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 px-2 text-xs"
      loading={loading}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function applyBulkSyncMode({
  connectionId,
  calendarIds,
  syncMode,
  setSyncModeBulk,
  t,
}: {
  connectionId: string;
  calendarIds: string[];
  syncMode: SyncMode;
  setSyncModeBulk: ReturnType<
    typeof trpc.calendars.setSyncModeBulk.useMutation
  >;
  t: ReturnType<typeof useTranslation>["t"];
}) {
  toast.promise(
    setSyncModeBulk.mutateAsync({
      connectionId,
      calendarIds,
      syncMode,
    }),
    {
      loading: t("bulkSyncModeLoading", {
        defaultValue: "Updating calendars…",
      }),
      success: t("bulkSyncModeSuccess", {
        defaultValue: "Calendar sync settings updated",
      }),
      error: t("bulkSyncModeError", {
        defaultValue: "Failed to update calendar sync settings",
      }),
    },
  );
}

function renderCalendarRow(
  c: ProviderCalendar & { lastSyncedAt?: Date | null },
  setSyncMode: ReturnType<typeof trpc.calendars.setSyncMode.useMutation>,
  t: ReturnType<typeof useTranslation>["t"],
) {
  const disabledInZoho = isProviderDisabled(c.providerData);
  const mode = (
    disabledInZoho ? "none" : (c.syncMode ?? "availability")
  ) as SyncMode;

  return (
    <li key={c.id} className="flex items-center gap-x-4">
      <Select
        value={mode}
        disabled={disabledInZoho}
        onValueChange={(value) => {
          const syncMode = value as SyncMode;
          toast.promise(
            setSyncMode.mutateAsync({
              calendarId: c.id,
              syncMode,
            }),
            {
              loading: t("settingCalendarSelection", {
                defaultValue: "Updating selection...",
              }),
              success: t("calendarSelectionSetSuccess", {
                defaultValue: "Calendar selection updated",
              }),
              error: (err) => {
                const message =
                  err instanceof Error ? err.message : String(err);
                if (message.includes("calendar_disabled_in_zoho")) {
                  return t("calendarDisabledInZoho", {
                    defaultValue:
                      "This calendar is disabled in Zoho and cannot be synced.",
                  });
                }
                return t("calendarSelectionSetError", {
                  defaultValue: "Failed to update selection",
                });
              },
            },
          );
        }}
      >
        <SelectTrigger className="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">
            <Trans i18nKey="syncModeNone" defaults="Don't sync" />
          </SelectItem>
          <SelectItem value="display">
            <Trans i18nKey="syncModeDisplay" defaults="Display only" />
          </SelectItem>
          <SelectItem value="availability">
            <Trans
              i18nKey="syncModeAvailability"
              defaults="Include in availability"
            />
          </SelectItem>
        </SelectContent>
      </Select>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <span
          className={`text-sm ${disabledInZoho ? "text-muted-foreground" : ""}`}
        >
          {c.name}
        </span>
        {disabledInZoho ? (
          <Badge variant="secondary" className="text-xs">
            <Trans i18nKey="zohoCalendarDisabled" defaults="Disabled in Zoho" />
          </Badge>
        ) : null}
      </div>
    </li>
  );
}
