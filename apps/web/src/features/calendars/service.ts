import { GoogleCalendarService } from "@/features/calendars/services/google-calendar";
import { ZohoCalendarService } from "@/features/calendars/services/zoho-calendar";

type CalendarServiceProvider = {
  provider: string;
  credentials: unknown;
  email?: string;
};

export const createCalendarService = async (
  service: CalendarServiceProvider,
) => {
  switch (service.provider) {
    case "google":
      return new GoogleCalendarService({
        credentials: GoogleCalendarService.credentialsSchema.parse(
          service.credentials,
        ),
      });
    case "zoho":
      if (!service.email) {
        throw new Error("Zoho calendar service requires email");
      }
      return new ZohoCalendarService({
        credentials: ZohoCalendarService.credentialsSchema.parse(
          service.credentials,
        ),
        email: service.email,
      });
    default:
      throw new Error(`Unsupported provider: ${service.provider}`);
  }
};
