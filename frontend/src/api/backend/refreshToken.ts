import AuthStore from "src/modules/AuthStore";
import * as api from "./base";
import type { TokenResponse } from "./responseTypes";

let pendingRefresh: { revision: number; request: Promise<TokenResponse> } | undefined;

export function refreshToken(): Promise<TokenResponse> {
	// React StrictMode and overlapping consumers must not rotate the same cookie twice.
	const revision = AuthStore.sessionRevision;
	if (!pendingRefresh || pendingRefresh.revision !== revision) {
		const request = api.post<TokenResponse>({ url: "/tokens/refresh", silentAuth: true }).finally(() => {
			// Finishing a previous session's request must not release the current rotation.
			if (pendingRefresh?.request === request) pendingRefresh = undefined;
		});
		pendingRefresh = { revision, request };
	}
	return pendingRefresh.request;
}
