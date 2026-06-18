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
import { PlusIcon, Trash2Icon } from "lucide-react";
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

export function ManualBlocksSettings() {
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

  const manualSources = sources?.filter((s) => s.type === "manual") ?? [];

  const addDialog = useDialog();
  const [label, setLabel] = React.useState("");
  const [manualStart, setManualStart] = React.useState("");
  const [manualEnd, setManualEnd] = React.useState("");

  const handleCreate = async () => {
    if (!label.trim() || !manualStart || !manualEnd) return;

    await toast.promise(
      createSource.mutateAsync({
        type: "manual",
        label: label.trim(),
        config: {
          blocks: [{ startISO: manualStart, endISO: manualEnd }],
        },
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
    setLabel("");
    setManualStart("");
    setManualEnd("");
    addDialog.dismiss();
  };

  if (isLoading) return null;

  return (
    <PageSection variant="card">
      <PageSectionHeader>
        <div className="flex w-full items-start justify-between gap-4">
          <div>
            <PageSectionTitle>
              <Trans i18nKey="manualBlocks" defaults="Manual blocks" />
            </PageSectionTitle>
            <PageSectionDescription>
              <Trans
                i18nKey="manualBlocksDescription"
                defaults="One-off busy periods included when suggesting poll times."
              />
            </PageSectionDescription>
          </div>
          <Button type="button" onClick={addDialog.trigger}>
            <PlusIcon data-icon="inline-start" />
            <Trans i18nKey="addManualBlock" defaults="Add block" />
          </Button>
        </div>
      </PageSectionHeader>
      <PageSectionContent>
        {manualSources.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            <Trans
              i18nKey="manualBlocksEmpty"
              defaults="No manual busy blocks yet."
            />
          </p>
        ) : (
          <ul className="space-y-3">
            {manualSources.map((source) => (
              <li
                key={source.id}
                className="flex items-center justify-between gap-4 rounded-lg border p-4"
              >
                <div>
                  <p className="font-medium text-sm">{source.label}</p>
                  <p className="text-muted-foreground text-xs capitalize">
                    manual block
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    toast.promise(deleteSource.mutateAsync({ id: source.id }), {
                      loading: t("availabilitySourceDeleting", {
                        defaultValue: "Deleting…",
                      }),
                      success: t("availabilitySourceDeleted", {
                        defaultValue: "Source deleted",
                      }),
                      error: t("availabilitySourceDeleteError", {
                        defaultValue: "Failed to delete source",
                      }),
                    });
                  }}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </PageSectionContent>

      <Dialog {...addDialog.dialogProps}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans i18nKey="addManualBlock" defaults="Add block" />
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manual-label">
                <Trans i18nKey="availabilitySourceLabel" defaults="Label" />
              </Label>
              <Input
                id="manual-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
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
                <Trans i18nKey="availabilityBlockEnd" defaults="Block end" />
              </Label>
              <Input
                id="manual-end"
                type="datetime-local"
                value={manualEnd}
                onChange={(e) => setManualEnd(e.target.value)}
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
