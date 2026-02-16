import CloudflaredTunnel from "../../../models/cloudflared_tunnel.js";
import { isDemoMode } from "../../../lib/config.js";

const checkDemo = () => {
	if (isDemoMode()) throw new Error("Cloudflare Tunnel management is disabled in Demo Mode.");
};

export const get_cloudflared_tunnels = async (access, args) => {
	const tunnels = await CloudflaredTunnel.query();
	return JSON.stringify(
		tunnels.map((t) => ({
			id: t.id,
			name: t.name,
			status: t.status,
			created_on: t.created_on,
		})),
	);
};

export const create_cloudflared_tunnel = async (access, args) => {
	const newTunnel = await CloudflaredTunnel.query().insert({
		name: args.name,
		token: args.token,
		status: 0,
	});
	return `Created Cloudflare Tunnel ID: ${newTunnel.id}`;
};

export const update_cloudflared_tunnel = async (access, args) => {
	await CloudflaredTunnel.query().patchAndFetchById(args.id, {
		name: args.name,
		token: args.token,
	});
	return `Updated Tunnel ID: ${args.id}`;
};

export const delete_cloudflared_tunnel = async (access, args) => {
	checkDemo();
	await CloudflaredTunnel.query().deleteById(args.id);
	return `Deleted Tunnel ID: ${args.id}`;
};
