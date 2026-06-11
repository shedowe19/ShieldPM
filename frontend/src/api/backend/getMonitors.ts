import * as api from "./base";
import type { Monitor } from "./models";

export async function getMonitors(): Promise<Monitor[]> {
	return await api.get({ url: "/monitoring" });
}
