import GoogleCalendarIcon from "@/features/calendars/assets/google-calendar.svg";
import OutlookIcon from "@/features/calendars/assets/outlook.svg";

export function CalendarProviderIcon({
  provider,
  size,
}: {
  provider: string;
  size: number;
}) {
  switch (provider) {
    case "google":
      return <GoogleCalendarIcon width={size} height={size} />;
    case "microsoft":
      return <OutlookIcon width={size} height={size} />;
    case "zoho":
      return (
        <span
          className="inline-flex items-center justify-center rounded bg-orange-500 font-bold text-[10px] text-white"
          style={{ width: size, height: size }}
        >
          Z
        </span>
      );
    default:
      return null;
  }
}
