import * as api from "./base";

export async function testDdnsProvider(id: number): Promise<unknown> {
	return await api.post({
		url: `/nginx/ddns-providers/${id}/test`,
	});
}
