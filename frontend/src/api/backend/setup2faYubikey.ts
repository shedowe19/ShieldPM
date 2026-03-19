import * as api from "./base";

export interface YubikeyAddResponse {
	id: number;
	type: string;
	label: string;
	createdOn: string;
}

export async function add2faYubikey(userId: number | "me", otp: string, label?: string): Promise<YubikeyAddResponse> {
	return api.post({ url: `/users/${userId}/2fa/yubikey/add`, data: { otp, label } });
}
