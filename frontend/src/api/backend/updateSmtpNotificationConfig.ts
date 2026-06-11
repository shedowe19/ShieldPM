import * as api from "./base";
import type { SmtpNotificationConfig } from "./models";

export type UpdateSmtpNotificationConfigPayload = Partial<Omit<SmtpNotificationConfig, "passwordSet">> & {
	password?: string;
};

export async function updateSmtpNotificationConfig(
	payload: UpdateSmtpNotificationConfigPayload,
): Promise<SmtpNotificationConfig> {
	return await api.put({
		url: "/monitoring/notifications/smtp",
		data: payload,
	});
}
