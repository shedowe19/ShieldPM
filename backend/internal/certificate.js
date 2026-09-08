import { createPrivateKey, randomUUID, X509Certificate } from "node:crypto";
import fs from "node:fs";
import path from "path";
import { ZipArchive } from "archiver";
import dayjs from "dayjs";
import _ from "lodash";
import tempWrite from "temp-write";
import error from "../lib/error.js";
import { sanitizeProxyHost } from "../lib/host-response.js";
import utils from "../lib/utils.js";
import { debug, ssl as logger } from "../logger.js";
import certificateModel from "../models/certificate.js";
import deadHostModel from "../models/dead_host.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import streamModel from "../models/stream.js";
import internalAuditLog from "./audit-log.js";
import * as certbot from "./certbot.js";
import internalGitOps from "./gitops.js";
import internalNginx from "./nginx.js";
import internalPki from "./pki.js";

const omissions = () => {
	return ["is_deleted", "owner.is_deleted", "meta.dns_provider_credentials"];
};

const certificateOperations = new Set();
const withCertificateLock = async (id, operation) => {
	if (certificateOperations.has(id)) {
		throw new error.ValidationError("Another operation is running for this certificate. Please try again later.");
	}
	certificateOperations.add(id);
	try {
		return await operation();
	} finally {
		certificateOperations.delete(id);
	}
};

const cleanUpMissingCertificatesUnlocked = async () => {
	const affectedHosts = [];
	try {
		logger.info("Checking for missing/deleted certificate references in hosts...");
		const activeCerts = await certificateModel.query().select("id").where("is_deleted", 0);
		const activeCertIds = new Set(activeCerts.map((certificate) => Number(certificate.id)));
		/** @type {Array<{model: import("objection").ModelClass<proxyHostModel | redirectionHostModel | deadHostModel | streamModel>, type: string, graph?: string}>} */
		const hostTypes = [
			{ model: proxyHostModel, type: "proxy_host", graph: "[host_domains,access_list.[clients,items]]" },
			{ model: redirectionHostModel, type: "redirection_host" },
			{ model: deadHostModel, type: "dead_host" },
			{ model: streamModel, type: "stream" },
		];

		for (const { model, type, graph } of hostTypes) {
			const hosts = await model.query().where("certificate_id", ">", 0).andWhere("is_deleted", 0);
			for (const host of hosts) {
				if (activeCertIds.has(Number(host.certificate_id))) continue;
				logger.warn(`Cleaning up ${type} ${host.id} due to missing certificate_id ${host.certificate_id}`);
				const patch =
					type === "stream"
						? { certificate_id: 0 }
						: {
								certificate_id: 0,
								ssl_forced: 0,
								http2_support: 0,
								hsts_enabled: 0,
								hsts_subdomains: 0,
							};
				await internalNginx.backupConfig(type, host);
				affectedHosts.push({ model, type, host, previous: _.pick(host, [...Object.keys(patch), "meta"]) });
				await model.query().where("id", host.id).patch(patch);
				const query = model.query().findById(host.id);
				if (graph) query.withGraphFetched(graph);
				const updatedHost = await query;
				if (updatedHost.enabled) {
					await internalNginx.generateConfig(type, updatedHost);
				} else {
					await internalNginx.deleteConfig(type, updatedHost);
				}
			}
		}

		if (affectedHosts.length > 0) {
			// Validate only after every stale reference has been removed from the generated configuration.
			await internalNginx.reload();
			for (const { model, host } of affectedHosts) {
				await model
					.query()
					.where("id", host.id)
					.patch({
						meta: { ...host.meta, nginx_online: Boolean(host.enabled), nginx_err: null },
					});
			}
		}
	} catch (err) {
		// Keep certificate files and restore every previous host configuration before releasing the global lock.
		for (const { model, type, host, previous } of affectedHosts.toReversed()) {
			try {
				await internalNginx.deleteConfig(type, host);
				await internalNginx.restoreConfig(type, host);
			} catch (rollbackError) {
				logger.error(
					`Failed to restore ${type} ${host.id} after certificate cleanup: ${rollbackError.message}`,
				);
			}
			try {
				await model.query().where("id", host.id).patch(previous);
			} catch (rollbackError) {
				logger.error(`Failed to restore ${type} ${host.id} metadata: ${rollbackError.message}`);
			}
		}
		if (affectedHosts.length) {
			try {
				await internalNginx.reload();
			} catch (rollbackError) {
				logger.error(`Failed to reload after certificate cleanup rollback: ${rollbackError.message}`);
			}
		}
		throw err;
	}
	for (const { type, host } of affectedHosts) {
		try {
			await internalNginx.deleteBackupConfig(type, host);
		} catch (cleanupError) {
			logger.error(`Failed to remove certificate cleanup backup: ${cleanupError.message}`);
		}
	}
};

const internalCertificate = {
	allowedSslFiles: ["certificate", "certificate_key", "intermediate_certificate"],
	interval: null,
	intervalProcessing: false,
	processing: false,

	initTimer: async () => {
		// Defer CRT env var parsing to runtime so NaN is never set at module load time.
		// Falls back to 72 hours if CRT is unset or not a valid integer.
		const crtHours = Number(process.env.CRT);
		const validInterval = Number.isInteger(crtHours) && crtHours > 0 && crtHours <= 596;
		const intervalTimeout = 1000 * 60 * 60 * (validInterval ? crtHours : 72);
		logger.info(`Certbot Renewal Timer initialized (interval: ${intervalTimeout / 1000 / 60 / 60}h)`);
		clearInterval(internalCertificate.interval);
		internalCertificate.interval = setInterval(internalCertificate.processExpiringHosts, intervalTimeout);
		// And do this now as well
		internalCertificate.processExpiringHosts();
		await internalCertificate.cleanUpMissingCertificates().catch((err) => {
			logger.error(`Error during missing certificate cleanup: ${err.message}`);
		});
	},

	/**
	 * Automatically checks for any hosts assigned to a deleted/missing certificate
	 * and unsets their certificate_id, then regenerates their nginx config.
	 */
	cleanUpMissingCertificates: () => internalNginx.withConfigurationLock(cleanUpMissingCertificatesUnlocked),

	/**
	 * Triggered by a timer, this will check for expiring hosts and renew their tls certs if required
	 */
	processExpiringHosts: async () => {
		if (!internalCertificate.intervalProcessing && !internalCertificate.processing) {
			internalCertificate.intervalProcessing = true;
			internalCertificate.processing = true;
			logger.info("Renewing Certbot TLS certs close to expiry...");

			try {
				const result = await certbot.runCertbot([
					"--config",
					"/etc/certbot.ini",
					"renew",
					"--server",
					process.env.ACME_SERVER,
					"--quiet",
				]);

				if (result) {
					logger.info(`Renew Result: ${result}`);
				}

				await internalNginx.withConfigurationLock(() => internalNginx.reload());
				logger.info("Renew Complete");

				// Now go and fetch all the certbot certs from the db and query the files and update expiry times
				const certificates = await certificateModel
					.query()
					.where("is_deleted", 0)
					.andWhere("provider", "letsencrypt");

				if (certificates && certificates.length > 0) {
					const promises = certificates.map(async (certificate) => {
						try {
							const certInfo = await internalCertificate.getCertificateInfoFromFile(
								`${internalCertificate.getLiveCertPath(certificate.id)}/fullchain.pem`,
							);
							await certificateModel
								.query()
								.where("id", certificate.id)
								.andWhere("provider", "letsencrypt")
								.patch({
									expires_on: /** @type {any} */ (
										dayjs.unix(certInfo.dates.to).format("YYYY-MM-DD HH:mm:ss")
									),
								});
						} catch (err) {
							// Don't want to stop the train here, just log the error
							logger.error(err.message);
						}
					});
					await Promise.all(promises);
				}
			} catch (err) {
				logger.error(err);
			} finally {
				internalCertificate.intervalProcessing = false;
				internalCertificate.processing = false;
			}
		}
	},

	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @param   {string}  data.provider
	 * @param   {Array<string>} data.domain_names
	 * @param   {string}  [data.nice_name]
	 * @param   {Object}  [data.meta]
	 * @param   {number}  [data.owner_user_id]
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		const thisData = /** @type {any} */ (_.cloneDeep(data));
		await access.can("certificates:create", thisData);
		thisData.owner_user_id = access.token.getUserId(1);
		if (thisData.provider === "letsencrypt" || thisData.provider === "internal") {
			if (!Array.isArray(thisData.domain_names) || thisData.domain_names.length === 0) {
				throw new error.ValidationError("At least one domain name is required for certificate creation");
			}
			thisData.nice_name = thisData.domain_names.join(", ");
		}

		const certificate = await certificateModel.query().insertAndFetch(thisData);
		let savedRow = certificate;
		try {
			let certInfo;
			let meta = certificate.meta;
			if (certificate.provider === "letsencrypt") {
				const request = certificate.meta?.dns_challenge
					? internalCertificate.requestCertbotWithDnsChallenge
					: internalCertificate.requestCertbot;
				await request(certificate);
				certInfo = await internalCertificate.getCertificateInfoFromFile(
					`${internalCertificate.getLiveCertPath(certificate.id)}/fullchain.pem`,
				);
				meta = { ...meta, letsencrypt_certificate: certInfo };
			} else if (certificate.provider === "internal") {
				const result = await internalPki.createLeadCert(
					{
						domain_names: certificate.domain_names,
						years: certificate.meta?.years ?? 10,
					},
					`/data/tls/internal/npm-${certificate.id}`,
				);
				certInfo = await internalCertificate.getCertificateInfoFromFile(result.fullchain);
				meta = { ...meta, certificate: result.fullchain, certificate_key: result.privkey };
			}
			if (certInfo) {
				savedRow = await certificateModel.query().patchAndFetchById(certificate.id, {
					expires_on: dayjs.unix(certInfo.dates.to).format("YYYY-MM-DD HH:mm:ss"),
					meta,
				});
			}
		} catch (err) {
			await certificateModel.query().deleteById(certificate.id);
			if (certificate.provider === "internal") {
				await fs.promises.rm(`/data/tls/internal/npm-${certificate.id}`, { recursive: true, force: true });
			}
			err.public = true;
			throw err;
		}

		const publicCertificate = utils.omitRow(omissions())(savedRow);
		publicCertificate.meta = internalCertificate.cleanMeta(publicCertificate.meta);
		// Once issuance is committed, an audit failure must not delete the working certificate.
		await internalCertificate.addCreatedAuditLog(access, certificate.id, publicCertificate);
		internalGitOps.triggerAutoPush("certificate");
		return publicCertificate;
	},

	addCreatedAuditLog: async (access, certificate_id, meta) => {
		const publicMeta = utils.omitRow(omissions())(meta);
		publicMeta.meta = internalCertificate.cleanMeta(publicMeta.meta);
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "certificate",
			object_id: certificate_id,
			meta: publicMeta,
		});
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @param  {String}  [data.email]
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {number}  data.id
	 * @param  {string}  [data.email]
	 * @param  {string}  [data.name]
	 * @param  {string}  [data.nice_name]
	 * @param  {Object}  [data.meta]
	 * @return {Promise}
	 */
	update: async (access, data) => {
		const thisData = /** @type {any} */ (data);
		await access.can("certificates:update", thisData.id);
		const row = await internalCertificate.get(access, { id: thisData.id });
		if (thisData.provider !== undefined && thisData.provider !== row.provider) {
			throw new error.ValidationError(
				"Certificate provider cannot be changed. Create a new certificate instead.",
			);
		}

		if (row.id !== thisData.id) {
			// Sanity check that something crazy hasn't happened
			throw new error.InternalValidationError(
				`Certificate could not be updated, IDs do not match: ${row.id} !== ${thisData.id}`,
			);
		}

		const savedRow = await certificateModel
			.query()
			.patchAndFetchById(row.id, /** @type {any} */ (thisData))
			.then(/** @type {any} */ (utils.omitRow(omissions())));

		savedRow.meta = internalCertificate.cleanMeta(savedRow.meta);
		if (thisData.meta) {
			thisData.meta = internalCertificate.cleanMeta(thisData.meta);
		}

		// Add row.nice_name for custom certs
		if (savedRow.provider === "other") {
			thisData.nice_name = savedRow.nice_name;
		}

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "certificate",
			object_id: row.id,
			meta: _.omit(thisData, ["expires_on"]), // this prevents json circular reference because expires_on might be raw
		});

		internalGitOps.triggerAutoPush("certificate");

		return savedRow;
	},

	/**
	 * @param  {import("../lib/types.js").Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @param  {Array}    [data.expand]
	 * @param  {Array}    [data.omit]
	 * @return {Promise}
	 */
	get: async (access, data, options = {}) => {
		const thisData = /** @type {any} */ (data || {});
		const accessData = await access.can("certificates:get", thisData.id);
		const query = certificateModel
			.query()
			.where("is_deleted", 0)
			.andWhere("id", thisData.id)
			.allowGraph("[owner,proxy_hosts,redirection_hosts,dead_hosts,streams]")
			.first();

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		if (typeof thisData.expand !== "undefined" && thisData.expand !== null) {
			query.withGraphFetched(`[${thisData.expand.join(", ")}]`);
		}

		const row = await query.then(/** @type {any} */ (utils.omitRow(omissions())));
		if (!row?.id) {
			throw new error.ItemNotFoundError(thisData.id);
		}
		if (!options.includeCertificateData) {
			row.meta = internalCertificate.cleanMeta(row.meta);
		}
		internalCertificate.cleanExpansions(row);
		// Custom omissions
		if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
			return _.omit(row, [...thisData.omit]);
		}

		return row;
	},

	cleanExpansions: (row) => {
		if (typeof row.proxy_hosts !== "undefined") {
			row.proxy_hosts = row.proxy_hosts.map(sanitizeProxyHost);
		}
		if (typeof row.redirection_hosts !== "undefined") {
			row.redirection_hosts = utils.omitRows(["is_deleted"])(row.redirection_hosts);
		}
		if (typeof row.dead_hosts !== "undefined") {
			row.dead_hosts = utils.omitRows(["is_deleted"])(row.dead_hosts);
		}
		if (typeof row.streams !== "undefined") {
			row.streams = utils.omitRows(["is_deleted"])(row.streams);
		}
		return row;
	},

	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @param   {Number}  data.id
	 * @returns {Promise}
	 */
	download: async (access, data) => {
		await access.can("certificates:get", data.id);
		const certificate = await internalCertificate.get(access, data);

		let zipDirectory;
		if (certificate.provider === "letsencrypt") {
			zipDirectory = internalCertificate.getLiveCertPath(data.id);
		} else if (certificate.provider === "internal") {
			zipDirectory = `/data/tls/internal/npm-${data.id}`;
		} else if (certificate.provider === "other") {
			zipDirectory = `/data/tls/custom/npm-${data.id}`;
		} else {
			throw new error.ValidationError("This certificate type cannot be downloaded");
		}

		if (!fs.existsSync(zipDirectory)) {
			throw new error.ItemNotFoundError(`Certificate ${certificate.nice_name} does not exist on disk`);
		}

		const certFiles = (await fs.promises.readdir(zipDirectory)).filter(
			(fn) => fn.endsWith(".pem") || fn.endsWith(".crt") || fn.endsWith(".key"),
		);
		const certFilesWithRealPaths = await Promise.all(
			certFiles.map((fn) => fs.promises.realpath(path.join(zipDirectory, fn))),
		);

		if (certFilesWithRealPaths.length === 0) {
			throw new error.ItemNotFoundError(`No certificate files found for ${certificate.nice_name}`);
		}

		const downloadName = `npm-${data.id}-${randomUUID()}.zip`;
		const opName = `/tmp/${downloadName}`;

		try {
			await internalCertificate.zipFiles(certFilesWithRealPaths, opName);
		} catch (err) {
			await fs.promises.rm(opName, { force: true });
			throw err;
		}
		debug(logger, "zip completed : ", opName);
		return {
			fileName: opName,
		};
	},

	/**
	 * @param   {Array<String>}  source
	 * @param   {String}  out
	 * @returns {Promise}
	 */
	zipFiles: async (source, out) => {
		const archive = new ZipArchive({ zlib: { level: 9 } });
		const stream = fs.createWriteStream(out, { mode: 0o600, flags: "wx" });

		return new Promise(
			/** @param {(value?: void) => void} resolve */ (resolve, reject) => {
				let failure;
				source.map((fl) => {
					const fileName = path.basename(fl);
					debug(logger, fl, "added to certificate zip");
					archive.file(fl, { name: fileName });
					return true;
				});
				const fail = (err) => {
					failure ||= err;
					archive.abort();
					stream.destroy();
				};
				archive.on("error", fail).on("warning", fail).pipe(stream);
				stream.on("error", fail);
				stream.on("close", () => (failure ? reject(failure) : resolve()));
				archive.finalize().catch(fail);
			},
		);
	},

	/**
	 * @param {import("../lib/types.js").Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: (access, data) =>
		withCertificateLock(data.id, async () => {
			await access.can("certificates:delete", data.id);
			const row = await internalCertificate.get(access, { id: data.id });

			if (!row?.id) {
				throw new error.ItemNotFoundError(data.id);
			}

			await internalNginx.withConfigurationLock(async () => {
				const detachCertificate = async () => {
					await certificateModel.query().where("id", row.id).patch({ is_deleted: 1 });
					try {
						// Detach TLS references and activate the new configuration while the old files still exist.
						await cleanUpMissingCertificatesUnlocked();
					} catch (cleanupError) {
						await certificateModel.query().where("id", row.id).patch({ is_deleted: 0 });
						throw cleanupError;
					}
				};
				if (row.provider === "letsencrypt") {
					// A busy renewal must reject before the certificate and host references are modified.
					await internalCertificate.revokeCertbot(row, true, detachCertificate);
				} else {
					await detachCertificate();
					if (row.provider === "internal") {
						await fs.promises.rm(`/data/tls/internal/npm-${row.id}`, { force: true, recursive: true });
					} else {
						await fs.promises.rm(`/data/tls/custom/npm-${row.id}`, { force: true, recursive: true });
						await fs.promises.rm(`/data/tls/custom/npm-${row.id}.der`, { force: true });
					}
				}
			});

			// Audit persistence must not prevent removal of a certificate already marked deleted.
			row.meta = internalCertificate.cleanMeta(row.meta);
			await internalAuditLog.add(access, {
				action: "deleted",
				object_type: "certificate",
				object_id: row.id,
				meta: _.omit(row, omissions()),
			});

			internalGitOps.triggerAutoPush("certificate");

			return true;
		}),

	/**
	 * All Certs
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Array}   [expand]
	 * @param   {String}  [searchQuery]
	 * @returns {Promise}
	 */
	getAll: async (access, expand, searchQuery) => {
		const accessData = await access.can("certificates:list");

		const query = certificateModel
			.query()
			.where("is_deleted", 0)
			.groupBy("id")
			.allowGraph("[owner,proxy_hosts,redirection_hosts,dead_hosts,streams]")
			.orderBy("nice_name", "ASC");

		if (accessData.permission_visibility !== "all") {
			query.andWhere("owner_user_id", access.token.getUserId(1));
		}

		// Query is used for searching
		if (typeof searchQuery === "string") {
			query.where(function () {
				this.where("nice_name", "like", `%${searchQuery}%`);
			});
		}

		if (typeof expand !== "undefined" && expand !== null) {
			query.withGraphFetched(`[${expand.join(", ")}]`);
		}

		const r = await query.then(/** @type {any} */ (utils.omitRows(omissions())));
		for (let i = 0; i < r.length; i++) {
			r[i].meta = internalCertificate.cleanMeta(r[i].meta);
			r[i] = internalCertificate.cleanExpansions(r[i]);
		}
		return r;
	},

	/**
	 * Report use
	 *
	 * @param   {Number}  userId
	 * @param   {String}  visibility
	 * @returns {Promise}
	 */
	getCount: async (userId, visibility) => {
		const query = certificateModel.query().count("id as count").where("is_deleted", 0);

		if (visibility !== "all") {
			query.andWhere("owner_user_id", userId);
		}

		const row = await query.first();
		return Number.parseInt(/** @type {any} */ (row).count, 10);
	},

	/**
	 * @param   {Object} certificate
	 * @returns {Promise}
	 */
	writeCustomCert: async (certificate, activate = async () => {}) => {
		logger.info("Writing Custom Certificate:", {
			...certificate,
			meta: internalCertificate.cleanMeta({ ...certificate.meta }, false),
		});

		const dir = `/data/tls/custom/npm-${certificate.id}`;

		if (certificate.provider === "letsencrypt" || certificate.provider === "internal") {
			throw new error.ValidationError("Refusing to write certbot/internal certs here");
		}

		let certData = certificate.meta.certificate;
		if (typeof certificate.meta.intermediate_certificate !== "undefined") {
			certData = `${certData}\n${certificate.meta.intermediate_certificate}`;
		}

		await fs.promises.mkdir(path.dirname(dir), { recursive: true });
		const stagingDir = await fs.promises.mkdtemp(`${dir}.staging-`);
		const backupDir = `${dir}.backup-${randomUUID()}`;
		let hadPrevious = false;
		let installed = false;
		let committed = false;
		try {
			await fs.promises.writeFile(`${stagingDir}/fullchain.pem`, certData);
			await fs.promises.writeFile(`${stagingDir}/privkey.pem`, certificate.meta.certificate_key, { mode: 0o600 });
			await internalNginx.withConfigurationLock(async () => {
				try {
					await fs.promises.rename(dir, backupDir);
					hadPrevious = true;
				} catch (err) {
					if (err.code !== "ENOENT") throw err;
				}
				try {
					await fs.promises.rename(stagingDir, dir);
					installed = true;
					await activate();
					committed = true;
				} catch (err) {
					if (installed) await fs.promises.rm(dir, { recursive: true, force: true });
					if (hadPrevious) await fs.promises.rename(backupDir, dir);
					if (installed) {
						try {
							await internalNginx.reload();
						} catch (reloadError) {
							logger.error(`Certificate rollback reload failed: ${reloadError.message}`);
						}
					}
					throw err;
				}
			});
		} finally {
			try {
				await fs.promises.rm(stagingDir, { recursive: true, force: true });
			} catch (cleanupError) {
				logger.warn(`Certificate staging cleanup failed: ${cleanupError.message}`);
			}
			// Keep the backup if restoring it failed, so a working key is never discarded.
			if (committed && hadPrevious) {
				try {
					await fs.promises.rm(backupDir, { recursive: true, force: true });
				} catch (cleanupError) {
					logger.warn(`Certificate backup cleanup failed: ${cleanupError.message}`);
				}
			}
		}
	},

	/**
	 * @param   {import("../lib/types.js").Access}   access
	 * @param   {import("../lib/types.js").Access}   access
	 * @param   {Object}      data
	 * @param   {Array<string>}    data.domain_names
	 * @param   {Object}      [data.meta]
	 * @returns {Promise}
	 */
	createQuickCertificate: async (access, data) => {
		return await internalCertificate.create(access, {
			provider: "letsencrypt",
			domain_names: data.domain_names,
			meta: data.meta,
		});
	},

	/**
	 * Validates that the certs provided are good.
	 * No access required here, nothing is changed or stored.
	 *
	 * @param   {Object}  data
	 * @param   {Object}  data.files
	 * @returns {Promise}
	 */
	validate: (data) => {
		// Put file contents into an object
		const files = {};
		Object.entries(data.files).forEach(([name, file]) => {
			if (internalCertificate.allowedSslFiles.indexOf(name) !== -1) {
				if (Array.isArray(file) || !Buffer.isBuffer(file?.data)) {
					throw new error.ValidationError(`Exactly one ${name} file must be uploaded`);
				}
				files[name] = file.data.toString();
			}
		});

		// For each file, create a temp file and write the contents to it
		// Then test it depending on the file type
		const promises = [];
		Object.entries(files).forEach(([type, content]) => {
			promises.push(
				new Promise((resolve) => {
					if (type === "certificate_key") {
						resolve(internalCertificate.checkPrivateKey(content));
					} else {
						// this should handle `certificate` and intermediate certificate
						resolve(internalCertificate.getCertificateInfo(content, true));
					}
				}).then((res) => {
					return { [type]: res };
				}),
			);
		});

		return Promise.all(promises).then((files) => {
			let data = {};
			_.each(files, (file) => {
				data = _.assign({}, data, file);
			});
			return data;
		});
	},

	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @param   {Number}  data.id
	 * @param   {Object}  data.files
	 * @returns {Promise}
	 */
	upload: (access, data) =>
		withCertificateLock(data.id, async () => {
			await access.can("certificates:update", data.id);
			const row = await internalCertificate.get(access, { id: data.id }, { includeCertificateData: true });
			if (row.provider !== "other") {
				throw new error.ValidationError("Cannot upload certificates for this type of provider");
			}

			const validations = await internalCertificate.validate(data);
			if (typeof validations.certificate === "undefined") {
				throw new error.ValidationError("Certificate file was not provided");
			}

			_.map(data.files, (file, name) => {
				if (internalCertificate.allowedSslFiles.indexOf(name) !== -1) {
					row.meta[name] = file.data.toString();
				}
			});
			if (!row.meta.certificate_key) {
				throw new error.ValidationError("Certificate key file was not provided");
			}
			try {
				const certificate = new X509Certificate(row.meta.certificate);
				if (!certificate.checkPrivateKey(createPrivateKey(row.meta.certificate_key))) {
					throw new error.ValidationError("Certificate and private key do not match");
				}
			} catch (err) {
				throw new error.ValidationError(`Certificate/key validation failed (${err.message})`, err);
			}

			const patch = {
				expires_on: /** @type {any} */ (
					dayjs.unix(validations.certificate.dates.to).format("YYYY-MM-DD HH:mm:ss")
				),
				domain_names: Array.from(
					new Set([validations.certificate.cn, ...(validations.certificate.sans || [])].filter(Boolean)),
				),
				meta: _.clone(row.meta),
			};
			await internalCertificate.writeCustomCert(row, async () => {
				await internalNginx.reload();
				// Publish database metadata only after the complete file pair is active and validated.
				await certificateModel.query().patchAndFetchById(data.id, patch);
			});
			await internalAuditLog.add(access, {
				action: "updated",
				object_type: "certificate",
				object_id: data.id,
				meta: {
					nice_name: row.nice_name,
					domain_names: patch.domain_names,
					meta: internalCertificate.cleanMeta(row.meta),
				},
			});
			internalGitOps.triggerAutoPush("certificate");
			return internalCertificate.cleanMeta(_.pick(row.meta, internalCertificate.allowedSslFiles));
		}),

	/**
	 * Validates a PEM private key in memory without writing its contents to temporary files.
	 *
	 * @param {String}  privateKey    This is the entire key contents as a string
	 */
	checkPrivateKey: async (privateKey) => {
		try {
			// Parse in-process: encrypted keys fail immediately without prompting or leaving a child process behind.
			createPrivateKey(privateKey);
			return true;
		} catch (err) {
			throw new error.ValidationError(`Certificate Key is not valid (${err.message})`, err);
		}
	},

	/**
	 * Uses the openssl command to both validate and get info out of the certificate.
	 * It will save the file to disk first, then run commands on it, then delete the file.
	 *
	 * @param {String}  certificate      This is the entire cert contents as a string
	 * @param {Boolean} [throwExpired]  Throw when the certificate is out of date
	 */
	getCertificateInfo: async (certificate, throwExpired) => {
		let filepath = null;
		try {
			filepath = await tempWrite(certificate, "cert.pem");
			const certData = await internalCertificate.getCertificateInfoFromFile(filepath, throwExpired);
			fs.unlinkSync(filepath);
			return certData;
		} catch (err) {
			if (filepath) {
				fs.unlinkSync(filepath);
			}
			throw err;
		}
	},

	/**
	 * Uses the openssl command to both validate and get info out of the certificate.
	 * It will save the file to disk first, then run commands on it, then delete the file.
	 *
	 * @param {String}  certificateFile The file location on disk
	 * @param {Boolean} [throw_expired]  Throw when the certificate is out of date
	 */
	getCertificateInfoFromFile: async (certificateFile, throw_expired) => {
		const certData = {};

		try {
			const result = await utils.execFile("openssl", ["x509", "-in", certificateFile, "-subject", "-noout"]);
			// Examples:
			// subject=CN = *.shieldpm.eu
			// subject=CN = something.example.com
			const regex = /(?:^subject=\s*|,\s*)CN\s*=\s*([^,\n]+)/i;
			const match = regex.exec(result);
			if (match && typeof match[1] !== "undefined") {
				certData.cn = match[1].trim();
			}

			const result2 = await utils.execFile("openssl", ["x509", "-in", certificateFile, "-issuer", "-noout"]);
			// Examples:
			// issuer=C = US, O = Let's Encrypt, CN = Let's Encrypt Authority X3
			// issuer=C = US, O = Let's Encrypt, CN = E5
			// issuer=O = NginxProxyManager, CN = NginxProxyManager Intermediate CA","O = NginxProxyManager, CN = NginxProxyManager Intermediate CA
			const regex2 = /^(?:issuer=)?(.*)$/gim;
			const match2 = regex2.exec(result2);
			if (match2 && typeof match2[1] !== "undefined") {
				certData.issuer = match2[1];
			}

			certData.sans = [];
			try {
				const resultSans = await utils.execFile("openssl", [
					"x509",
					"-in",
					certificateFile,
					"-ext",
					"subjectAltName",
					"-noout",
				]);
				const linesSans = resultSans.split("\n");
				for (const line of linesSans) {
					if (line.includes("DNS:")) {
						const parts = line.split(",");
						for (const part of parts) {
							const trimmed = part.trim();
							if (trimmed.startsWith("DNS:")) {
								certData.sans.push(trimmed.substring(4));
							}
						}
					}
				}
			} catch (_err) {
				// Certificate might not have SANs, ignore error
			}

			const result3 = await utils.execFile("openssl", ["x509", "-in", certificateFile, "-dates", "-noout"]);
			// notBefore=Jul 14 04:04:29 2018 GMT
			// notAfter=Oct 12 04:04:29 2018 GMT
			let validFrom = null;
			let validTo = null;

			const lines = result3.split("\n");
			lines.map((str) => {
				const regex = /^(\S+)=(.*)$/gim;
				const match = regex.exec(str.trim());

				if (match && typeof match[2] !== "undefined") {
					// Use dayjs to parse the date
					const dateString = match[2].replace(/\s+/g, " ");
					const date = Math.floor(Date.parse(dateString) / 1000);

					if (match[1].toLowerCase() === "notbefore") {
						validFrom = date;
					} else if (match[1].toLowerCase() === "notafter") {
						validTo = date;
					}
				}
				return true;
			});

			if (!validFrom || !validTo) {
				throw new error.ValidationError(`Could not determine dates from certificate: ${result3}`);
			}

			if (throw_expired && validTo < dayjs().unix()) {
				throw new error.ValidationError("Certificate has expired");
			}

			certData.dates = {
				from: validFrom,
				to: validTo,
			};

			return certData;
		} catch (err) {
			throw new error.ValidationError(`Certificate is not valid (${err.message})`, err);
		}
	},

	/**
	 * Cleans the tls keys from the meta object and sets them
	 *
	 * @param   {Object}  meta
	 * @param   {Boolean} [remove]
	 * @returns {Object}
	 */
	cleanMeta: (meta, remove) => {
		const clean = { ...meta };
		delete clean.dns_provider_credentials;
		internalCertificate.allowedSslFiles.map((key) => {
			if (typeof clean[key] !== "undefined" && clean[key]) {
				if (remove) {
					delete clean[key];
				} else {
					clean[key] = true;
				}
			}
			return true;
		});
		return clean;
	},

	/**
	 * Request a certificate using the http challenge
	 * @param   {Object}  certificate   the certificate row
	 * @returns {Promise}
	 */
	requestCertbot: (certificate) => certbot.requestCertbot(certificate),

	/**
	 * @param   {Object}   certificate  the certificate row
	 * @returns {Promise}
	 */
	requestCertbotWithDnsChallenge: (certificate) => certbot.requestCertbotWithDnsChallenge(certificate),

	/**
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {Object}  data
	 * @param   {Number}  data.id
	 * @returns {Promise}
	 */
	renew: (access, data) =>
		withCertificateLock(data.id, async () => {
			await access.can("certificates:update", data.id);
			const certificate = await internalCertificate.get(access, data);

			if (certificate.provider === "letsencrypt") {
				const renewMethod = certificate.meta.dns_challenge
					? internalCertificate.renewCertbotWithDnsChallenge
					: internalCertificate.renewCertbot;

				await renewMethod(certificate);
				const certInfo = await internalCertificate.getCertificateInfoFromFile(
					`${internalCertificate.getLiveCertPath(certificate.id)}/fullchain.pem`,
				);

				const updatedCertificate = await certificateModel.query().patchAndFetchById(certificate.id, {
					expires_on: /** @type {any} */ (dayjs.unix(certInfo.dates.to).format("YYYY-MM-DD HH:mm:ss")),
				});
				await internalNginx.withConfigurationLock(() => internalNginx.reload());
				const publicCertificate = utils.omitRow(omissions())(updatedCertificate);
				publicCertificate.meta = internalCertificate.cleanMeta(publicCertificate.meta);

				// Add to audit log
				await internalAuditLog.add(access, {
					action: "renewed",
					object_type: "certificate",
					object_id: updatedCertificate.id,
					meta: publicCertificate,
				});

				return publicCertificate;
			}

			throw new error.ValidationError("Only Certbot certificates can be renewed");
		}),

	/**
	 * @param   {Object}  certificate   the certificate row
	 * @returns {Promise}
	 */
	renewCertbot: (certificate) => certbot.renewCertbot(certificate),

	/**
	 * @param   {Object}  certificate   the certificate row
	 * @returns {Promise}
	 */
	renewCertbotWithDnsChallenge: (certificate) => certbot.renewCertbotWithDnsChallenge(certificate),

	/**
	 * @param   {Object}  certificate    the certificate row
	 * @param   {Boolean} [throwErrors]
	 * @param   {Function} [prepare]
	 * @returns {Promise}
	 */
	revokeCertbot: (certificate, throwErrors, prepare) => certbot.revokeCertbot(certificate, throwErrors, prepare),

	/**
	 *
	 * @param   {Object}    payload
	 * @param   {string[]}  payload.domains
	 * @returns
	 */
	testHttpsChallenge: (access, payload) => certbot.testHttpsChallenge(access, payload),

	performTestForDomain: (domain) => certbot.performTestForDomain(domain),

	getLiveCertPath: (certificateId) => certbot.getLiveCertPath(certificateId),
};

export default internalCertificate;
