import express from "express";
import internalAuditLog from "../../internal/audit-log.js";
import internalWireguard from "../../internal/wireguard.js";
import { isDemoMode } from "../../lib/config.js";
import jwtdecode from "../../lib/express/jwt-decode.js";
import apiValidator from "../../lib/validator/api.js";
import { global as logger } from "../../logger.js";
import WireguardPeer from "../../models/wireguard_peer.js";
import { getValidationSchema } from "../../schema/index.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * Middleware: JWT Decode & Demo Mode Block
 */
router.use(jwtdecode());

// Block all write operations in demo mode
router.use((req, res, next) => {
	if (isDemoMode() && req.method !== "GET") {
		res.status(403).send({ error: "WireGuard Tunnels are disabled in Demo Mode" });
		return;
	}
	next();
});

/**
 * GET /api/nginx/wireguard
 * Returns server info + all peers
 */
router.get("/", async (_req, res) => {
	const accessData = await res.locals.access.can("wireguard_peers:list");
	const query = WireguardPeer.query().andWhere("is_deleted", 0).orderBy("name", "ASC");

	if (accessData.permission_visibility !== "all") {
		query.where("owner_user_id", res.locals.access.token.getUserId(1));
	}

	const peers = await query;
	const server = await internalWireguard.getServerInfo();

	// Refresh live statuses
	try {
		await internalWireguard.refreshStatuses();
	} catch (err) {
		logger.debug("WireGuard: Could not refresh live statuses:", err.message);
	}

	// Strip private keys from response
	const sanitizedPeers = peers.map((p) => {
		const { client_private_key, preshared_key, ...rest } = p;
		return rest;
	});

	res.status(200).send({
		peers: sanitizedPeers,
		server,
	});
});

/**
 * GET /api/nginx/wireguard/status
 * Returns live status of all peers
 */
router.get("/status", async (_req, res) => {
	const accessData = await res.locals.access.can("wireguard_peers:list");
	const ownerUserId = accessData.permission_visibility === "all" ? null : res.locals.access.token.getUserId(1);

	try {
		if (ownerUserId === null) {
			await internalWireguard.refreshStatuses();
		} else {
			await internalWireguard.refreshStatuses(ownerUserId);
		}
		const query = WireguardPeer.query().where("is_deleted", 0).orderBy("name", "ASC");

		if (ownerUserId !== null) {
			query.where("owner_user_id", ownerUserId);
		}

		const peers = await query;

		const sanitizedPeers = peers.map((p) => {
			const { client_private_key, preshared_key, ...rest } = p;
			return rest;
		});

		res.status(200).send({ peers: sanitizedPeers });
	} catch (err) {
		res.status(500).send({ error: err.message });
	}
});

/**
 * GET /api/nginx/wireguard/settings
 * Returns WireGuard server settings
 */
router.get("/settings", async (_req, res) => {
	await res.locals.access.can("settings:get", "wireguard-config");

	try {
		const settings = await internalWireguard.getSettings();
		res.status(200).send(settings);
	} catch (err) {
		res.status(500).send({ error: err.message });
	}
});

/**
 * PUT /api/nginx/wireguard/settings
 * Update WireGuard server settings
 */
router.put("/settings", async (req, res) => {
	await res.locals.access.can("settings:update", "wireguard-config");

	try {
		const payload = await apiValidator(getValidationSchema("/nginx/wireguard/settings", "put"), req.body);
		const updated = await internalWireguard.updateSettings(payload);

		await internalAuditLog.add(res.locals.access, {
			action: "updated",
			object_type: "wireguard-settings",
			object_id: 0,
			meta: updated,
		});

		res.status(200).send(updated);
	} catch (err) {
		res.status(err.status || 500).send({ error: err.message });
	}
});

/**
 * GET /api/nginx/wireguard/:id
 */
router.get("/:id", async (req, res) => {
	const accessData = await res.locals.access.can("wireguard_peers:get", req.params.id);
	const query = WireguardPeer.query().andWhere("is_deleted", 0).where("id", req.params.id);

	if (accessData.permission_visibility !== "all") {
		query.where("owner_user_id", res.locals.access.token.getUserId(1));
	}

	const peer = await query.first();

	if (!peer) {
		res.status(404).send({ error: "WireGuard Peer not found" });
		return;
	}

	// Strip private keys
	const { client_private_key, preshared_key, ...rest } = peer;
	res.status(200).send(rest);
});

/**
 * POST /api/nginx/wireguard
 */
router.post("/", async (req, res, next) => {
	try {
		const payload = await apiValidator(getValidationSchema("/nginx/wireguard", "post"), req.body);
		await res.locals.access.can("wireguard_peers:create", payload);
		const ownerUserId = res.locals.access.token.getUserId(1);

		const peer = await internalWireguard.createPeer(payload, ownerUserId);

		// Audit Log
		await internalAuditLog.add(res.locals.access, {
			action: "created",
			object_type: "wireguard-peer",
			object_id: peer.id,
			meta: {
				name: peer.name,
				client_address: peer.client_address,
			},
		});

		res.status(201).send(peer);
	} catch (err) {
		next(err);
	}
});

/**
 * PUT /api/nginx/wireguard/:id
 */
router.put("/:id", async (req, res, next) => {
	try {
		await res.locals.access.can("wireguard_peers:update", req.params.id);
		const peer = await WireguardPeer.query()
			.where("owner_user_id", res.locals.access.token.getUserId(1))
			.andWhere("is_deleted", 0)
			.where("id", req.params.id)
			.first();

		if (!peer) {
			res.status(404).send({ error: "WireGuard Peer not found" });
			return;
		}

		const payload = await apiValidator(getValidationSchema("/nginx/wireguard/{id}", "put"), req.body);
		const updated = await internalWireguard.updatePeer(peer.id, payload);

		// Audit Log
		await internalAuditLog.add(res.locals.access, {
			action: "updated",
			object_type: "wireguard-peer",
			object_id: updated.id,
			meta: {
				name: updated.name,
			},
		});

		// Strip private keys
		const { client_private_key, preshared_key, ...rest } = updated;
		res.status(200).send(rest);
	} catch (err) {
		next(err);
	}
});

/**
 * DELETE /api/nginx/wireguard/:id
 */
router.delete("/:id", async (req, res, next) => {
	try {
		await res.locals.access.can("wireguard_peers:delete", req.params.id);
		const peer = await WireguardPeer.query()
			.where("owner_user_id", res.locals.access.token.getUserId(1))
			.andWhere("is_deleted", 0)
			.where("id", req.params.id)
			.first();

		if (!peer) {
			res.status(404).send({ error: "WireGuard Peer not found" });
			return;
		}

		await internalWireguard.deletePeer(peer.id);

		// Audit Log
		await internalAuditLog.add(res.locals.access, {
			action: "deleted",
			object_type: "wireguard-peer",
			object_id: peer.id,
			meta: {
				name: peer.name,
				client_address: peer.client_address,
			},
		});

		res.status(200).send({ status: "OK" });
	} catch (err) {
		next(err);
	}
});

/**
 * POST /api/nginx/wireguard/:id/enable
 */
router.post("/:id/enable", async (req, res) => {
	await res.locals.access.can("wireguard_peers:update", req.params.id);
	const peer = await WireguardPeer.query()
		.where("owner_user_id", res.locals.access.token.getUserId(1))
		.andWhere("is_deleted", 0)
		.where("id", req.params.id)
		.first();

	if (!peer) {
		res.status(404).send({ error: "WireGuard Peer not found" });
		return;
	}

	const updated = await internalWireguard.enablePeer(peer.id);

	await internalAuditLog.add(res.locals.access, {
		action: "updated",
		object_type: "wireguard-peer",
		object_id: updated.id,
		meta: { name: updated.name, status: "enabled" },
	});

	const { client_private_key, preshared_key, ...rest } = updated;
	res.status(200).send(rest);
});

/**
 * POST /api/nginx/wireguard/:id/disable
 */
router.post("/:id/disable", async (req, res) => {
	await res.locals.access.can("wireguard_peers:update", req.params.id);
	const peer = await WireguardPeer.query()
		.where("owner_user_id", res.locals.access.token.getUserId(1))
		.andWhere("is_deleted", 0)
		.where("id", req.params.id)
		.first();

	if (!peer) {
		res.status(404).send({ error: "WireGuard Peer not found" });
		return;
	}

	const updated = await internalWireguard.disablePeer(peer.id);

	await internalAuditLog.add(res.locals.access, {
		action: "updated",
		object_type: "wireguard-peer",
		object_id: updated.id,
		meta: { name: updated.name, status: "disabled" },
	});

	const { client_private_key, preshared_key, ...rest } = updated;
	res.status(200).send(rest);
});

/**
 * GET /api/nginx/wireguard/:id/config
 * Returns the WireGuard client configuration as text
 */
router.get("/:id/config", async (req, res) => {
	await res.locals.access.can("wireguard_peers:get", req.params.id);
	const peer = await WireguardPeer.query()
		.where("owner_user_id", res.locals.access.token.getUserId(1))
		.andWhere("is_deleted", 0)
		.where("id", req.params.id)
		.first();

	if (!peer) {
		res.status(404).send({ error: "WireGuard Peer not found" });
		return;
	}

	try {
		const config = await internalWireguard.generateClientConfig(peer.id);
		res.status(200).send({ config });
	} catch (err) {
		res.status(500).send({ error: err.message });
	}
});

/**
 * GET /api/nginx/wireguard/:id/qrcode
 * Returns QR code as data URL
 */
router.get("/:id/qrcode", async (req, res) => {
	await res.locals.access.can("wireguard_peers:get", req.params.id);
	const peer = await WireguardPeer.query()
		.where("owner_user_id", res.locals.access.token.getUserId(1))
		.andWhere("is_deleted", 0)
		.where("id", req.params.id)
		.first();

	if (!peer) {
		res.status(404).send({ error: "WireGuard Peer not found" });
		return;
	}

	try {
		const qrcode = await internalWireguard.generateQRCode(peer.id);
		res.status(200).send({ qrcode });
	} catch (err) {
		res.status(500).send({ error: err.message });
	}
});

export default router;
