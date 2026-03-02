import * as api from "./base";
import type { TokenResponse } from "./responseTypes";

export async function restoreSession(): Promise<TokenResponse> {
	return await api.post({
		url: "/tokens/restore",
	});
}
