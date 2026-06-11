import * as api from "./base";

export interface TestSmtpNotificationConfigPayload {
	to?: string[];
}

export interface TestSmtpNotificationConfigResult {
	sent: boolean;
	messageId: string | null;
}

export async function testSmtpNotificationConfig(
	payload: TestSmtpNotificationConfigPayload = {},
): Promise<TestSmtpNotificationConfigResult> {
	return await api.post({
		url: "/monitoring/notifications/smtp/test",
		data: payload,
	});
}
