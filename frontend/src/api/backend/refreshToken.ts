import * as api from "./base";
import type { TokenResponse } from "./responseTypes";

let pendingRefresh: Promise<TokenResponse> | undefined;

export function refreshToken(): Promise<TokenResponse> {
	// React StrictMode and overlapping consumers must not rotate the same cookie twice.
	if (!pendingRefresh) {
		pendingRefresh = api.post<TokenResponse>({ url: "/tokens/refresh", silentAuth: true }).finally(() => {
			pendingRefresh = undefined;
		});
	}
	return pendingRefresh;
}
