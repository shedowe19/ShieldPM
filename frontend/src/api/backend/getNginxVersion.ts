import * as api from "./base";

export async function getNginxVersion(): Promise<{ version: string }> {
	return await api.get({
		url: "/nginx/version",
	});
}
