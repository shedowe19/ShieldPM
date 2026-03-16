import * as api from "./base";
import type { TokenResponse } from "./responseTypes";

export async function refreshToken(): Promise<TokenResponse> {
	return await api.post({
		url: "/tokens/refresh",
		silentAuth: true,
	});
}
