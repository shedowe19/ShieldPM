import * as api from "./base";
import type { TokenResponse } from "./responseTypes";

export interface TwoFaChallengeResponse {
	requires2fa: true;
	pendingToken: string;
	methods: string[];
	csrfToken?: string;
}

export interface TwoFaVerifyRequest {
	pendingToken: string;
	method: "totp" | "yubikey" | "backup_code";
	code: string;
}

export async function verify2faCode(data: TwoFaVerifyRequest): Promise<TokenResponse> {
	return api.post({
		url: "/tokens/2fa/verify",
		data: {
			pending_token: data.pendingToken,
			method: data.method,
			code: data.code,
		},
	});
}

export interface PasskeyAuthBeginResponse {
	options: PublicKeyCredentialRequestOptionsJSON;
	challengeId: string;
}

export async function begin2faPasskeyAuth(pendingToken: string): Promise<PasskeyAuthBeginResponse> {
	return api.post({ url: "/tokens/2fa/passkey/begin", data: { pending_token: pendingToken } });
}

export async function complete2faPasskeyAuth(
	pendingToken: string,
	challengeId: string,
	authResponse: unknown,
): Promise<TokenResponse> {
	return api.post({
		url: "/tokens/2fa/passkey/complete",
		data: {
			pending_token: pendingToken,
			challenge_id: challengeId,
			auth_response: authResponse,
		},
		rawKeys: true,
	});
}

export interface DuoBeginResponse {
	authUrl: string;
	state: string;
}

export async function begin2faDuoAuth(pendingToken: string): Promise<DuoBeginResponse> {
	return api.post({ url: "/tokens/2fa/duo/begin", data: { pending_token: pendingToken } });
}

export async function complete2faDuoAuth(pendingToken: string, duoCode: string, state: string): Promise<TokenResponse> {
	return api.post({
		url: "/tokens/2fa/duo/complete",
		data: { pending_token: pendingToken, duo_code: duoCode, state },
	});
}
