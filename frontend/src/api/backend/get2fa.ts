import * as api from "./base";

export interface TwoFaMethod {
	id: number;
	type: "totp" | "yubikey" | "passkey" | "duo";
	label: string;
	isVerified: boolean;
	createdOn: string;
}

export interface TwoFaStatusResponse {
	methods: TwoFaMethod[];
	backupCodesRemaining: number;
}

export async function get2fa(userId: number | "me"): Promise<TwoFaStatusResponse> {
	return api.get({ url: `/users/${userId}/2fa` });
}
