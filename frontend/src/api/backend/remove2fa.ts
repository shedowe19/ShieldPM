import * as api from "./base";

export async function remove2faMethod(userId: number | "me", methodId: number): Promise<void> {
	return api.del({ url: `/users/${userId}/2fa/${methodId}` });
}
