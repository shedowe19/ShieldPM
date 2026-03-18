import * as api from "./base";

export interface DuoSetupRequest {
	clientId: string;
	clientSecret: string;
	apiHost: string;
	redirectUrl: string;
}

export interface DuoSetupResponse {
	id: number;
	type: string;
	label: string;
	createdOn: string;
}

export async function setup2faDuo(userId: number | "me", config: DuoSetupRequest): Promise<DuoSetupResponse> {
	return api.post({
		url: `/users/${userId}/2fa/duo/setup`,
		data: {
			client_id: config.clientId,
			client_secret: config.clientSecret,
			api_host: config.apiHost,
			redirect_url: config.redirectUrl,
		},
	});
}
