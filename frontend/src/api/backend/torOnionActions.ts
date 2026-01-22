import * as api from "./base";
import type { TorOnion } from "./models";

export async function startTorOnion(id: number): Promise<TorOnion> {
	return await api.post({
		url: `/nginx/tor-onion/${id}/start`,
	});
}

export async function stopTorOnion(id: number): Promise<TorOnion> {
	return await api.post({
		url: `/nginx/tor-onion/${id}/stop`,
	});
}
