"use client";

import { Button } from "@rallly/ui/button";
import type { useDialog } from "@rallly/ui/dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@rallly/ui/dialog";
import { Input } from "@rallly/ui/input";
import { Label } from "@rallly/ui/label";
import { toast } from "@rallly/ui/sonner";
import * as React from "react";
import { Trans, useTranslation } from "@/i18n/client";
import { trpc } from "@/trpc/client";

export function ConnectCalDAVDialog({
  dialog,
}: {
  dialog: ReturnType<typeof useDialog>;
}) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const connectCalDAV = trpc.calendars.connectCalDAV.useMutation({
    onSuccess: () => {
      utils.calendars.list.invalidate();
      utils.availability.connections.list.invalidate();
      dialog.dismiss();
    },
  });

  const [serverUrl, setServerUrl] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [calendarPath, setCalendarPath] = React.useState("");
  const [displayName, setDisplayName] = React.useState("CalDAV");

  const handleConnect = () => {
    if (!serverUrl.trim() || !username.trim() || !password) return;
    toast.promise(
      connectCalDAV.mutateAsync({
        serverUrl: serverUrl.trim(),
        username: username.trim(),
        password,
        calendarPath: calendarPath.trim() || undefined,
        displayName: displayName.trim() || "CalDAV",
      }),
      {
        loading: t("connectingCalDAV", { defaultValue: "Connecting CalDAV…" }),
        success: t("connectCalDAVSuccess", {
          defaultValue: "CalDAV connected",
        }),
        error: t("connectCalDAVError", {
          defaultValue: "Failed to connect CalDAV",
        }),
      },
    );
  };

  return (
    <Dialog {...dialog.dialogProps}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans i18nKey="connectCalDAV" defaults="Connect CalDAV" />
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="caldav-connect-name">
              <Trans i18nKey="displayName" defaults="Display name" />
            </Label>
            <Input
              id="caldav-connect-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="caldav-connect-server">
              <Trans i18nKey="caldavServerUrl" defaults="Server URL" />
            </Label>
            <Input
              id="caldav-connect-server"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="https://calendar.zoho.com/.well-known/caldav"
            />
            <p className="text-muted-foreground text-xs">
              <Trans
                i18nKey="caldavServerUrlHint"
                defaults="For Zoho: use https://calendar.zoho.com/.well-known/caldav (or your DC host) with your Zoho email and an app-specific password if 2FA is on."
              />
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="caldav-connect-user">
              <Trans i18nKey="username" defaults="Username" />
            </Label>
            <Input
              id="caldav-connect-user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="caldav-connect-pass">
              <Trans i18nKey="password" defaults="Password" />
            </Label>
            <Input
              id="caldav-connect-pass"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="caldav-connect-path">
              <Trans
                i18nKey="caldavCalendarPath"
                defaults="Calendar path (optional)"
              />
            </Label>
            <Input
              id="caldav-connect-path"
              value={calendarPath}
              onChange={(e) => setCalendarPath(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={dialog.dismiss}>
            <Trans i18nKey="cancel" defaults="Cancel" />
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={connectCalDAV.isPending}
            onClick={handleConnect}
          >
            <Trans i18nKey="connect" defaults="Connect" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
