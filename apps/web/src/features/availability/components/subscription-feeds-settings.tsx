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

export function SubscriptionFeedsSettings() {
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

  const icsSources = sources?.filter((s) => s.type === "ics_url") ?? [];

  const getIcsUrl = (config: unknown): string | undefined => {
    if (!config || typeof config !== "object") return undefined;
    const url = (config as { url?: unknown }).url;
    return typeof url === "string" ? url : undefined;
  };

  const truncateUrl = (url: string, max = 56) =>
    url.length <= max ? url : `${url.slice(0, max - 1)}…`;

  const runIcsTest = async (params: { id?: string; url?: string }) => {
    return testSource.mutateAsync(params);
  };

  const addDialog = useDialog();
  const [label, setLabel] = React.useState("");
  const [icsUrl, setIcsUrl] = React.useState("");

  const resetForm = () => {
    setLabel("");
    setIcsUrl("");
  };

  const handleCreate = async () => {
    if (!label.trim() || !icsUrl.trim()) return;

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

    await toast.promise(
      createSource.mutateAsync({
        type: "ics_url",
        label: label.trim(),
        config: { url: icsUrl.trim() },
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

  if (isLoading) return null;

  return (
    <PageSection variant="card">
      <PageSectionHeader>
        <div className="flex w-full items-start justify-between gap-4">
          <div>
            <PageSectionTitle>
              <Trans
                i18nKey="subscriptionFeeds"
                defaults="Subscription feeds"
              />
            </PageSectionTitle>
            <PageSectionDescription>
              <Trans
                i18nKey="subscriptionFeedsDescription"
                defaults="Read-only ICS URLs synced periodically for availability and the calendar dashboard."
              />
            </PageSectionDescription>
          </div>
          <Button type="button" onClick={addDialog.trigger}>
            <PlusIcon data-icon="inline-start" />
            <Trans i18nKey="addSubscriptionFeed" defaults="Add ICS feed" />
          </Button>
        </div>
      </PageSectionHeader>
      <PageSectionContent>
        {icsSources.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            <Trans
              i18nKey="subscriptionFeedsEmpty"
              defaults="No ICS subscription feeds yet."
            />
          </p>
        ) : (
          <ul className="space-y-3">
            {icsSources.map((source) => {
              const url = getIcsUrl(source.config);
              const testResult = testResults[source.id];
              return (
                <li
                  key={source.id}
                  className="flex items-start justify-between gap-4 rounded-lg border p-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm">{source.label}</p>
                    {url ? (
                      <p
                        className="mt-1 truncate font-mono text-muted-foreground text-xs"
                        title={url}
                      >
                        {truncateUrl(url)}
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
                    ) : (
                      <p className="mt-1 text-muted-foreground text-xs">
                        <Trans
                          i18nKey="icsFeedSyncNote"
                          defaults="Synced on a schedule and when you test the feed."
                        />
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
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
              <Trans i18nKey="addSubscriptionFeed" defaults="Add ICS feed" />
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="feed-label">
                <Trans i18nKey="availabilitySourceLabel" defaults="Label" />
              </Label>
              <Input
                id="feed-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Team holidays feed"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="feed-url">ICS URL</Label>
              <Input
                id="feed-url"
                type="url"
                value={icsUrl}
                onChange={(e) => setIcsUrl(e.target.value)}
                placeholder="https://calendar.example.com/feed.ics"
              />
            </div>
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
