"use client";

import { Button } from "@rallly/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  useDialog,
} from "@rallly/ui/dialog";
import { Input } from "@rallly/ui/input";
import { Label } from "@rallly/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@rallly/ui/select";
import { toast } from "@rallly/ui/sonner";
import { PlusIcon, RefreshCcwIcon, Trash2Icon } from "lucide-react";
import * as React from "react";
import {
  PageSection,
  PageSectionContent,
  PageSectionDescription,
  PageSectionHeader,
  PageSectionTitle,
} from "@/app/components/page-layout";
import { Trans, useTranslation } from "@/i18n/client";
import { trpc } from "@/trpc/client";

type SourceType = "ics_url" | "caldav" | "manual";

export function AvailabilitySourcesSettings() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const { data: sources, isLoading } =
    trpc.availability.sources.list.useQuery();
  const createSource = trpc.availability.sources.create.useMutation({
    onSuccess: () => utils.availability.sources.list.invalidate(),
  });
  const deleteSource = trpc.availability.sources.delete.useMutation({
    onSuccess: () => utils.availability.sources.list.invalidate(),
  });
  const testSource = trpc.availability.sources.test.useMutation();
  const [testResults, setTestResults] = React.useState<
    Record<string, { ok: boolean; message: string }>
  >({});

  const getIcsUrl = (config: unknown): string | undefined => {
    if (!config || typeof config !== "object") return undefined;
    const url = (config as { url?: unknown }).url;
    return typeof url === "string" ? url : undefined;
  };

  const truncateUrl = (url: string, max = 56) =>
    url.length <= max ? url : `${url.slice(0, max - 1)}…`;

  const runIcsTest = async (params: { id?: string; url?: string }) => {
    const result = await testSource.mutateAsync(params);
    return result;
  };

  const addDialog = useDialog();
  const [sourceType, setSourceType] = React.useState<SourceType>("ics_url");
  const [label, setLabel] = React.useState("");
  const [icsUrl, setIcsUrl] = React.useState("");
  const [caldavServer, setCaldavServer] = React.useState("");
  const [caldavUsername, setCaldavUsername] = React.useState("");
  const [caldavPassword, setCaldavPassword] = React.useState("");
  const [caldavPath, setCaldavPath] = React.useState("");
  const [manualStart, setManualStart] = React.useState("");
  const [manualEnd, setManualEnd] = React.useState("");

  const resetForm = () => {
    setSourceType("ics_url");
    setLabel("");
    setIcsUrl("");
    setCaldavServer("");
    setCaldavUsername("");
    setCaldavPassword("");
    setCaldavPath("");
    setManualStart("");
    setManualEnd("");
  };

  const handleCreate = async () => {
    if (!label.trim()) return;

    let config: Record<string, unknown> = {};
    if (sourceType === "ics_url") {
      if (!icsUrl.trim()) return;
      const test = await runIcsTest({ url: icsUrl.trim() });
      if (!test.ok) {
        toast.error(
          t("availabilitySourceTestFailed", {
            defaultValue: "ICS feed test failed: {error}",
            error: test.error,
          }),
        );
        return;
      }
      config = { url: icsUrl.trim() };
    } else if (sourceType === "caldav") {
      config = {
        serverUrl: caldavServer.trim(),
        username: caldavUsername.trim(),
        password: caldavPassword,
        calendarPath: caldavPath.trim() || undefined,
      };
    } else {
      config = {
        blocks:
          manualStart && manualEnd
            ? [{ startISO: manualStart, endISO: manualEnd }]
            : [],
      };
    }

    await toast.promise(
      createSource.mutateAsync({
        type: sourceType,
        label: label.trim(),
        config,
      }),
      {
        loading: t("availabilitySourceSaving", {
          defaultValue: "Saving source…",
        }),
        success: t("availabilitySourceSaved", { defaultValue: "Source saved" }),
        error: t("availabilitySourceSaveError", {
          defaultValue: "Failed to save source",
        }),
      },
    );
    resetForm();
    addDialog.dismiss();
  };

  if (isLoading) {
    return null;
  }

  return (
    <PageSection variant="card">
      <PageSectionHeader>
        <div className="flex w-full items-start justify-between gap-4">
          <div>
            <PageSectionTitle>
              <Trans
                i18nKey="availabilitySources"
                defaults="Availability sources"
              />
            </PageSectionTitle>
            <PageSectionDescription>
              <Trans
                i18nKey="availabilitySourcesDescription"
                defaults="ICS subscription URLs, CalDAV accounts, and manual busy blocks used when suggesting poll times."
              />
            </PageSectionDescription>
          </div>
          <Button type="button" onClick={addDialog.trigger}>
            <PlusIcon data-icon="inline-start" />
            <Trans i18nKey="addAvailabilitySource" defaults="Add source" />
          </Button>
        </div>
      </PageSectionHeader>
      <PageSectionContent>
        {!sources?.length ? (
          <p className="text-muted-foreground text-sm">
            <Trans
              i18nKey="availabilitySourcesEmpty"
              defaults="No availability sources yet. Add an ICS URL, CalDAV account, or manual block."
            />
          </p>
        ) : (
          <ul className="space-y-3">
            {sources.map((source) => {
              const icsUrl = getIcsUrl(source.config);
              const testResult = testResults[source.id];

              return (
                <li
                  key={source.id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{source.label}</p>
                    <p className="text-muted-foreground text-sm capitalize">
                      {source.type.replace("_", " ")}
                    </p>
                    {icsUrl ? (
                      <p
                        className="mt-1 truncate font-mono text-muted-foreground text-xs"
                        title={icsUrl}
                      >
                        {truncateUrl(icsUrl)}
                      </p>
                    ) : null}
                    {testResult ? (
                      <p
                        className={
                          testResult.ok
                            ? "mt-1 text-green-600 text-xs dark:text-green-500"
                            : "mt-1 text-rose-600 text-xs dark:text-rose-500"
                        }
                      >
                        {testResult.message}
                      </p>
                    ) : source.type === "ics_url" ? (
                      <p className="mt-1 text-muted-foreground text-xs">
                        <Trans
                          i18nKey="icsFeedOnDemandNote"
                          defaults="Fetched on demand when you suggest free slots on a new poll."
                        />
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {source.type === "ics_url" ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        loading={
                          testSource.isPending &&
                          testSource.variables?.id === source.id
                        }
                        onClick={async () => {
                          try {
                            const result = await runIcsTest({ id: source.id });
                            setTestResults((prev) => ({
                              ...prev,
                              [source.id]: {
                                ok: result.ok,
                                message: result.ok
                                  ? t("availabilitySourceTestSuccessInline", {
                                      defaultValue:
                                        "{count} busy windows found (next 14 days)",
                                      count: result.busyWindowCount,
                                    })
                                  : result.error,
                              },
                            }));
                            if (result.ok) {
                              toast.success(
                                t("availabilitySourceTestSuccess", {
                                  defaultValue:
                                    "Feed OK — {count} busy windows in next 14 days",
                                  count: result.busyWindowCount,
                                }),
                              );
                            } else {
                              toast.error(
                                t("availabilitySourceTestFailed", {
                                  defaultValue: "ICS feed test failed: {error}",
                                  error: result.error,
                                }),
                              );
                            }
                          } catch {
                            toast.error(
                              t("availabilitySourceTestFailedGeneric", {
                                defaultValue: "ICS feed test failed",
                              }),
                            );
                          }
                        }}
                      >
                        <RefreshCcwIcon className="size-4" />
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        toast.promise(
                          deleteSource.mutateAsync({ id: source.id }),
                          {
                            loading: t("availabilitySourceDeleting", {
                              defaultValue: "Deleting…",
                            }),
                            success: t("availabilitySourceDeleted", {
                              defaultValue: "Source deleted",
                            }),
                            error: t("availabilitySourceDeleteError", {
                              defaultValue: "Failed to delete source",
                            }),
                          },
                        );
                      }}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </PageSectionContent>

      <Dialog {...addDialog.dialogProps}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans i18nKey="addAvailabilitySource" defaults="Add source" />
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>
                <Trans i18nKey="availabilitySourceType" defaults="Type" />
              </Label>
              <Select
                value={sourceType}
                onValueChange={(v) => setSourceType(v as SourceType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ics_url">ICS URL</SelectItem>
                  <SelectItem value="caldav">CalDAV</SelectItem>
                  <SelectItem value="manual">
                    <Trans
                      i18nKey="availabilityManualBlock"
                      defaults="Manual block"
                    />
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source-label">
                <Trans i18nKey="availabilitySourceLabel" defaults="Label" />
              </Label>
              <Input
                id="source-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Work calendar feed"
              />
            </div>
            {sourceType === "ics_url" ? (
              <div className="space-y-2">
                <Label htmlFor="ics-url">ICS URL</Label>
                <Input
                  id="ics-url"
                  type="url"
                  value={icsUrl}
                  onChange={(e) => setIcsUrl(e.target.value)}
                  placeholder="https://calendar.example.com/feed.ics"
                />
              </div>
            ) : null}
            {sourceType === "caldav" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="caldav-server">
                    <Trans i18nKey="caldavServerUrl" defaults="Server URL" />
                  </Label>
                  <Input
                    id="caldav-server"
                    value={caldavServer}
                    onChange={(e) => setCaldavServer(e.target.value)}
                    placeholder="https://calendar.example.com/caldav"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="caldav-user">
                    <Trans i18nKey="username" defaults="Username" />
                  </Label>
                  <Input
                    id="caldav-user"
                    value={caldavUsername}
                    onChange={(e) => setCaldavUsername(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="caldav-pass">
                    <Trans i18nKey="password" defaults="Password" />
                  </Label>
                  <Input
                    id="caldav-pass"
                    type="password"
                    value={caldavPassword}
                    onChange={(e) => setCaldavPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="caldav-path">
                    <Trans
                      i18nKey="caldavCalendarPath"
                      defaults="Calendar path (optional)"
                    />
                  </Label>
                  <Input
                    id="caldav-path"
                    value={caldavPath}
                    onChange={(e) => setCaldavPath(e.target.value)}
                  />
                </div>
              </>
            ) : null}
            {sourceType === "manual" ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="manual-start">
                    <Trans
                      i18nKey="availabilityBlockStart"
                      defaults="Block start"
                    />
                  </Label>
                  <Input
                    id="manual-start"
                    type="datetime-local"
                    value={manualStart}
                    onChange={(e) => setManualStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="manual-end">
                    <Trans
                      i18nKey="availabilityBlockEnd"
                      defaults="Block end"
                    />
                  </Label>
                  <Input
                    id="manual-end"
                    type="datetime-local"
                    value={manualEnd}
                    onChange={(e) => setManualEnd(e.target.value)}
                  />
                </div>
              </>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={addDialog.dismiss}>
              <Trans i18nKey="cancel" defaults="Cancel" />
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={createSource.isPending}
              onClick={handleCreate}
            >
              <Trans i18nKey="save" defaults="Save" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageSection>
  );
}
