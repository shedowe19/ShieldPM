import * as api from "./base";

export interface PasskeyRegistrationBeginResponse {
	options: PublicKeyCredentialCreationOptionsJSON;
	challengeId: string;
}

export interface PasskeyRegistrationCompleteResponse {
	message: string;
	backupCodes: string[] | null;
}

export async function beginPasskeyRegistration(userId: number | "me"): Promise<PasskeyRegistrationBeginResponse> {
	return api.post({ url: `/users/${userId}/2fa/passkey/register/begin` });
}

export async function completePasskeyRegistration(
	userId: number | "me",
	challengeId: string,
	registrationResponse: unknown,
	label?: string,
): Promise<PasskeyRegistrationCompleteResponse> {
	return api.post({
		url: `/users/${userId}/2fa/passkey/register/complete`,
		data: { challenge_id: challengeId, registration_response: registrationResponse, label },
	});
}
