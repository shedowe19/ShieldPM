import * as api from "./base";

export async function deleteCloudflaredTunnel(id: number): Promise<void> {
	await api.del({
		url: `/nginx/cloudflared-tunnels/${id}`,
	});
}
