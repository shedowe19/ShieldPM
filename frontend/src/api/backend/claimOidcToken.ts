import * as api from "./base";
import type { TokenResponse } from "./responseTypes";

export interface OidcStepUpChallenge {
	requires2fa: true;
	pendingToken: string;
	methods: string[];
	csrfToken?: string;
}

export async function claimOidcToken(): Promise<TokenResponse> {
	return await api.post({
		url: "/oidc/claim",
		silentAuth: true,
	});
}

/**
 * Returns the pending local second-factor challenge after an OIDC sign-in, or
 * null when the callback did not start a step-up. A 401/404 simply means there
 * is no step-up cookie in this browser.
 */
export async function getOidcStepUp(): Promise<OidcStepUpChallenge | null> {
	try {
		return await api.get<OidcStepUpChallenge>({
			url: "/oidc/step-up",
			silentAuth: true,
		});
	} catch {
		return null;
	}
}
