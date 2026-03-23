import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { transaction } from "objection";
import { global as logger } from "../../logger.js";
import { auditLogService } from "../audit-log/index.js";
import ProxyHost from "../../models/proxy_host.js";
import TorOnion from "../../models/tor_onion.js";
import { buildConfigText, torDataPath, writeTorKeyFiles } from "./helpers.js";

const torService = {
	process: null,

	async regenerateTorConfig() {
		const onions = await TorOnion.query().where("is_deleted", 0);
		const services = [];
		for (const onion of onions) {
			const target = onion.forward_to || "127.0.0.1:80";
			const dir = path.join(torDataPath, String(onion.id));
			const token = onion.domain || crypto.randomBytes(12).toString("hex");
			const hostname = await writeTorKeyFiles(dir, token);
			if (!onion.domain)
				await TorOnion.query().patchAndFetchById(onion.id, { domain: hostname.replace(/\.onion$/, "") });
			services.push({ dir, target });
		}
		await fs.promises.mkdir(torDataPath, { recursive: true });
		const torrc = buildConfigText(services);
		await fs.promises.writeFile(path.join(torDataPath, "torrc"), torrc, "utf8");
		return torrc;
	},

	async start() {
		await torService.regenerateTorConfig();
		if (torService.process) return;
		const torrcPath = path.join(torDataPath, "torrc");
		torService.process = spawn("tor", ["-f", torrcPath], { stdio: ["ignore", "pipe", "pipe"] });
		torService.process.stdout.on("data", (d) => logger.info(`[tor] ${d.toString().trim()}`));
		torService.process.stderr.on("data", (d) => logger.warn(`[tor] ${d.toString().trim()}`));
		torService.process.on("exit", (code) => {
			logger.warn(`[tor] exited with code ${code}`);
			torService.process = null;
		});
	},

	async restart() {
		await torService.stop();
		await torService.start();
	},

	async stop() {
		if (!torService.process) return;
		torService.process.kill("SIGTERM");
		torService.process = null;
	},

	async syncFromHosts() {
		const hosts = await ProxyHost.query().where("is_deleted", 0).whereNotNull("domain_names");
		for (const host of hosts) {
			const wantsOnion = host.meta?.tor_enabled;
			const existing = await TorOnion.query().where("proxy_host_id", host.id).where("is_deleted", 0).first();
			if (wantsOnion && !existing) {
				await TorOnion.query().insert({
					proxy_host_id: host.id,
					forward_to: `${host.forward_host}:${host.forward_port}`,
				});
			} else if (!wantsOnion && existing) {
				await TorOnion.query().patchAndFetchById(existing.id, { is_deleted: 1 });
			}
		}
	},

	async init() {
		await torService.syncFromHosts();
		await torService.start();
	},

	// ─── CRUD operations (called from routes) ───

	/**
	 * List all non-deleted tor onion services with proxy_host.
	 */
	async list(access) {
		const accessData = await access.can("tor_onions:list");
		const query = TorOnion.query().andWhere("is_deleted", 0).withGraphFetched("proxy_host").orderBy("name", "ASC");

		if (accessData.permission_visibility !== "all") {
			query.where("owner_user_id", access.token.getUserId(1));
		}

		const services = await query;
		const torInfo = await torService.getInfo();

		return { services, tor: torInfo };
	},

	/**
	 * Get a single tor onion service by id.
	 */
	async get(id, access) {
		const accessData = await access.can("tor_onions:get", id);
		const query = TorOnion.query().andWhere("is_deleted", 0).where("id", id).withGraphFetched("proxy_host");

		if (accessData.permission_visibility !== "all") {
			query.where("owner_user_id", access.token.getUserId(1));
		}

		const service = await query.first();
		if (!service) {
			const err = new Error("Onion Service not found");
			err.status = 404;
			throw err;
		}
		return service;
	},

	/**
	 * Create a new tor onion service.
	 */
	async create(payload, access) {
		await access.can("tor_onions:create", payload);
		payload.owner_user_id = access.token.getUserId(1);
		payload.meta = {};
		payload.status = 0;

		let trx;
		try {
			trx = await transaction.start(TorOnion.knex());
			const service = await TorOnion.query(trx).insert(payload);
			await trx.commit();

			const newService = await TorOnion.query().findById(service.id);
			const result = await torService.createOnion(newService);
			const finalService = await TorOnion.query().findById(service.id).withGraphFetched("proxy_host");

			await auditLogService.add(access, {
				action: "created",
				object_type: "tor-onion",
				object_id: finalService.id,
				meta: {
					name: finalService.name,
					onion_address: finalService.onionAddress,
				},
			});

			return { ...finalService, created: result !== null };
		} catch (err) {
			if (trx) await trx.rollback();
			throw err;
		}
	},

	/**
	 * Update a tor onion service.
	 */
	async update(id, payload, access) {
		await access.can("tor_onions:update", id);
		const service = await TorOnion.query()
			.where("owner_user_id", access.token.getUserId(1))
			.andWhere("is_deleted", 0)
			.where("id", id)
			.first();

		if (!service) {
			const err = new Error("Onion Service not found");
			err.status = 404;
			throw err;
		}

		let trx;
		try {
			trx = await transaction.start(TorOnion.knex());
			const result = await service.$query(trx).patchAndFetch(payload);
			await trx.commit();

			if (payload.virtual_port || payload.target_port) {
				await torService.restartOnion(result);
			}

			const updatedService = await TorOnion.query().findById(result.id).withGraphFetched("proxy_host");

			await auditLogService.add(access, {
				action: "updated",
				object_type: "tor-onion",
				object_id: updatedService.id,
				meta: {
					name: updatedService.name,
					onion_address: updatedService.onionAddress,
				},
			});

			return updatedService;
		} catch (err) {
			if (trx) await trx.rollback();
			throw err;
		}
	},

	/**
	 * Delete a tor onion service.
	 */
	async remove(id, access) {
		await access.can("tor_onions:delete", id);
		const service = await TorOnion.query()
			.where("owner_user_id", access.token.getUserId(1))
			.andWhere("is_deleted", 0)
			.where("id", id)
			.first();

		if (!service) {
			const err = new Error("Onion Service not found");
			err.status = 404;
			throw err;
		}

		await torService.stopOnion(service);

		let trx;
		try {
			trx = await transaction.start(TorOnion.knex());
			await service.$query(trx).delete();
			await trx.commit();

			await auditLogService.add(access, {
				action: "deleted",
				object_type: "tor-onion",
				object_id: service.id,
				meta: {
					name: service.name,
					onion_address: service.onionAddress,
				},
			});

			return { status: "OK" };
		} catch (err) {
			if (trx) await trx.rollback();
			throw err;
		}
	},

	/**
	 * Start a tor onion service by id.
	 */
	async startById(id, access) {
		await access.can("tor_onions:update", id);
		const service = await TorOnion.query()
			.where("owner_user_id", access.token.getUserId(1))
			.andWhere("is_deleted", 0)
			.where("id", id)
			.first();

		if (!service) {
			const err = new Error("Onion Service not found");
			err.status = 404;
			throw err;
		}

		if (!service.private_key) {
			await torService.createOnion(service);
		} else {
			await torService.startOnion(service);
		}

		const updatedService = await TorOnion.query().findById(service.id).withGraphFetched("proxy_host");

		await auditLogService.add(access, {
			action: "updated",
			object_type: "tor-onion",
			object_id: updatedService.id,
			meta: {
				name: updatedService.name,
				onion_address: updatedService.onionAddress,
				status: "started",
			},
		});

		return updatedService;
	},

	/**
	 * Stop a tor onion service by id.
	 */
	async stopById(id, access) {
		await access.can("tor_onions:update", id);
		const service = await TorOnion.query()
			.where("owner_user_id", access.token.getUserId(1))
			.andWhere("is_deleted", 0)
			.where("id", id)
			.first();

		if (!service) {
			const err = new Error("Onion Service not found");
			err.status = 404;
			throw err;
		}

		await torService.stopOnion(service);

		const updatedService = await TorOnion.query().findById(service.id).withGraphFetched("proxy_host");

		await auditLogService.add(access, {
			action: "updated",
			object_type: "tor-onion",
			object_id: updatedService.id,
			meta: {
				name: updatedService.name,
				onion_address: updatedService.onionAddress,
				status: "stopped",
			},
		});

		return updatedService;
	},

	// ─── Tor process-level helpers for individual onion services ───
	// These delegate to the existing process methods or are placeholders
	// for per-service tor control operations.

	/** Get tor daemon info / availability */
	async getInfo() {
		return {
			running: torService.process !== null,
		};
	},

	/** Create a new onion service in tor (keygen + config reload) */
	async createOnion(service) {
		await torService.regenerateTorConfig();
		await torService.restart();
		return service;
	},

	/** Start an existing onion service in tor */
	async startOnion(service) {
		await torService.regenerateTorConfig();
		if (!torService.process) {
			await torService.start();
		} else {
			await torService.restart();
		}
		return service;
	},

	/** Restart tor for an updated onion service */
	async restartOnion(_service) {
		await torService.regenerateTorConfig();
		await torService.restart();
	},

	/** Stop/remove an onion service from tor */
	async stopOnion(_service) {
		await torService.regenerateTorConfig();
		await torService.restart();
	},
};

export default torService;
