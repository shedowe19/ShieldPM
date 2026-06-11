import * as api from "./base";
import type { SmtpNotificationConfig } from "./models";

export async function getSmtpNotificationConfig(): Promise<SmtpNotificationConfig> {
	return await api.get({
		url: "/monitoring/notifications/smtp",
	});
}
