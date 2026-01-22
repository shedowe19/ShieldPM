import * as api from "./base";

export async function deleteTorOnion(id: number): Promise<{ status: string }> {
	return await api.del({
		url: `/nginx/tor-onion/${id}`,
	});
}
