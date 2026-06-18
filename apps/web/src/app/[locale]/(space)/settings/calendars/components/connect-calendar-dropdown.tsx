"use client";

import { Button } from "@rallly/ui/button";
import { useDialog } from "@rallly/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@rallly/ui/dropdown-menu";

import { CalendarIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import Image from "next/image";
import { connectToCalendar } from "@/features/calendars/client";
import { Trans } from "@/i18n/client";
import { ConnectCalDAVDialog } from "./connect-caldav-dialog";

export function ConnectCalendarDropdown() {
  const caldavDialog = useDialog();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button>
            <PlusIcon data-icon="inline-start" />
            <Trans i18nKey="connectCalendar" defaults="Connect Calendar" />
            <ChevronDownIcon data-icon="inline-end" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              connectToCalendar("google-calendar");
            }}
          >
            <Image
              src="/static/google-calendar.svg"
              width={16}
              height={16}
              alt="Google Calendar"
            />
            <Trans i18nKey="connectGoogleCalendar" defaults="Google Calendar" />
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              connectToCalendar("zoho-calendar");
            }}
          >
            <CalendarIcon className="size-4" />
            <Trans i18nKey="connectZohoCalendar" defaults="Zoho Calendar" />
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              caldavDialog.trigger();
            }}
          >
            <CalendarIcon className="size-4" />
            <Trans i18nKey="connectCalDAV" defaults="Connect CalDAV" />
          </DropdownMenuItem>
          <DropdownMenuItem disabled className="opacity-60">
            <Image
              src="/static/outlook.svg"
              width={16}
              height={16}
              alt="Microsoft Calendar"
            />
            <Trans
              i18nKey="connectMicrosoftCalendarComingSoon"
              defaults="Microsoft Calendar (coming soon)"
            />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConnectCalDAVDialog dialog={caldavDialog} />
    </>
  );
}
