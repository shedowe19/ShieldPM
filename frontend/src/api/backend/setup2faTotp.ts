import * as api from "./base";

export interface TotpSetupResponse {
	qrDataUrl: string;
	otpauthUrl: string;
}

export async function setup2faTotp(userId: number | "me"): Promise<TotpSetupResponse> {
	return api.post({ url: `/users/${userId}/2fa/totp/setup` });
}

export interface TotpEnableResponse {
	message: string;
	backupCodes: string[];
}

export async function enable2faTotp(userId: number | "me", code: string): Promise<TotpEnableResponse> {
	return api.post({ url: `/users/${userId}/2fa/totp/enable`, data: { code } });
}
