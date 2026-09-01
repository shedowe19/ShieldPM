import * as api from "./base";
import type { TokenResponse } from "./responseTypes";
import type { TwoFaChallengeResponse } from "./verify2fa";

export type StepUpResponse = TokenResponse | TwoFaChallengeResponse;

export async function stepUpAuthentication(currentPassword: string): Promise<StepUpResponse> {
	return api.post({
		url: "/tokens/step-up",
		data: { current_password: currentPassword },
	});
}
