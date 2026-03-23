import { spawn } from "node:child_process";
import { global as logger } from "../../logger.js";
import CloudflaredTunnel from "../../models/cloudflared_tunnel.js";
import { deleteProcess, getProcess, hasProcess, setProcess } from "./state.js";

const start = async (tunnel) => {
	if (hasProcess(tunnel.id)) {
		await stop(tunnel.id);
	}
	logger.info(`Starting Cloudflared Tunnel: ${tunnel.name} (${tunnel.id})`);
	await tunnel.$query().patch({ status: 1 });
	try {
		const child = spawn("/usr/local/bin/cloudflared", ["tunnel", "run"], {
			stdio: ["ignore", "pipe", "pipe"],
			detached: false,
			env: { ...process.env, TUNNEL_TOKEN: tunnel.token },
		});
		setProcess(tunnel.id, child);
		let errorLog = "";
		child.stdout.on("data", (data) => {
			const str = data.toString();
			logger.debug(`[Cloudflared ${tunnel.id}] ${str}`);
			errorLog = (errorLog + str).slice(-2000);
		});
		child.stderr.on("data", (data) => {
			const str = data.toString();
			logger.info(`[Cloudflared ${tunnel.id}] ${str}`);
			errorLog = (errorLog + str).slice(-2000);
		});
		child.on("exit", (code, signal) => {
			logger.warn(`Cloudflared Tunnel ${tunnel.id} exited with code ${code} / signal ${signal}`);
			deleteProcess(tunnel.id);
			const newStatus = code === 0 || code === null ? 0 : 3;
			const patchData = { status: newStatus };
			const meta = { ...tunnel.meta };
			if (newStatus === 3 && errorLog) meta.last_error = errorLog.trim();
			else delete meta.last_error;
			patchData.meta = meta;
			tunnel
				.$query()
				.patch(patchData)
				.then(() => {
					logger.info(`[Cloudflared ${tunnel.id}] Updated status to ${newStatus}`);
				})
				.catch((err) => {
					logger.error(`[Cloudflared ${tunnel.id}] Failed to update status:`, err);
				});
		});
		await new Promise((resolve) => setTimeout(resolve, 2000));
		if (hasProcess(tunnel.id)) {
			const meta = { ...tunnel.meta };
			delete meta.last_error;
			await tunnel.$query().patch({ status: 2, meta });
		}
	} catch (err) {
		logger.error(`Failed to start Cloudflared Tunnel ${tunnel.id}:`, err);
		await tunnel.$query().patch({ status: 3 });
	}
};

const stop = async (tunnelId) => {
	const child = getProcess(tunnelId);
	if (child) {
		logger.info(`Stopping Cloudflared Tunnel: ${tunnelId}`);
		child.kill("SIGTERM");
		deleteProcess(tunnelId);
		await CloudflaredTunnel.query().findById(tunnelId).patch({ status: 0 });
	}
};

const restart = async (tunnel) => {
	await stop(tunnel.id);
	await new Promise((resolve) => setTimeout(resolve, 1000));
	await start(tunnel);
};

const list = async (access) => {
	const accessData = await access.can("cloudflared_tunnels:list");
	const query = CloudflaredTunnel.query().andWhere("is_deleted", 0).orderBy("name", "ASC");
	if (accessData.permission_visibility !== "all") {
		query.where("owner_user_id", access.token.getUserId(1));
	}
	return query;
};

const get = async (access, id) => {
	const accessData = await access.can("cloudflared_tunnels:get", id);
	const query = CloudflaredTunnel.query().andWhere("is_deleted", 0).where("id", id);
	if (accessData.permission_visibility !== "all") {
		query.where("owner_user_id", access.token.getUserId(1));
	}
	return query.first();
};

const create = async (access, payload) => {
	await access.can("cloudflared_tunnels:create", payload);
	payload.owner_user_id = access.token.getUserId(1);
	payload.meta = {};
	const tunnel = await CloudflaredTunnel.query().insert(payload);
	return CloudflaredTunnel.query().findById(tunnel.id);
};

const update = async (access, id, payload) => {
	await access.can("cloudflared_tunnels:update", id);
	const tunnel = await CloudflaredTunnel.query()
		.where("owner_user_id", access.token.getUserId(1))
		.andWhere("is_deleted", 0)
		.where("id", id)
		.first();
	if (!tunnel) return null;
	return tunnel.$query().patchAndFetch(payload);
};

const remove = async (access, id) => {
	await access.can("cloudflared_tunnels:delete", id);
	const tunnel = await CloudflaredTunnel.query()
		.where("owner_user_id", access.token.getUserId(1))
		.andWhere("is_deleted", 0)
		.where("id", id)
		.first();
	if (!tunnel) return null;
	await tunnel.$query().delete();
	return tunnel;
};

const init = async () => {
	logger.info("Initializing Cloudflared Tunnels...");
	const tunnels = await CloudflaredTunnel.query();
	for (const tunnel of tunnels) {
		await tunnel.$query().patch({ status: 0 });
		start(tunnel);
	}
};

export default { init, start, stop, restart, list, get, create, update, remove };
