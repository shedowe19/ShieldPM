import fs from "node:fs";
import path from "path";
import { ZipArchive } from "archiver";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat.js";
import _ from "lodash";
import tempWrite from "temp-write";
import error from "../lib/error.js";
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

dayjs.extend(customParseFormat);

const omissions = () => {
	return ["is_deleted", "owner.is_deleted", "meta.dns_provider_credentials"];
};

const internalCertificate = {
	allowedSslFiles: ["certificate", "certificate_key", "intermediate_certificate"],
	interval: null,
	intervalProcessing: false,
	processing: false,

	initTimer: async () => {
		// Defer CRT env var parsing to runtime so NaN is never set at module load time.
		// Falls back to 72 hours if CRT is unset or not a valid integer.
		const crtHours = Number.parseInt(process.env.CRT, 10);
		const intervalTimeout = 1000 * 60 * 60 * (Number.isFinite(crtHours) ? crtHours : 72);
		logger.info(`Certbot Renewal Timer initialized (interval: ${intervalTimeout / 1000 / 60 / 60}h)`);
		internalCertificate.interval = setInterval(internalCertificate.processExpiringHosts, intervalTimeout);
		// And do this now as well
		internalCertificate.processExpiringHosts();
		await internalCertificate.cleanUpMissingCertificates();
	},

	/**
	 * Automatically checks for any hosts assigned to a deleted/missing certificate
	 * and unsets their certificate_id, then regenerates their nginx config.
	 */
	cleanUpMissingCertificates: async () => {
		try {
			logger.info("Checking for missing/deleted certificate references in hosts...");
			let reloadRequired = false;

			// Fetch all active certificate IDs
			const activeCerts = await certificateModel.query().select("id").where("is_deleted", 0);
			const activeCertIds = activeCerts.map((c) => c.id);

			// Find proxy hosts pointing to certificates
			const proxyHosts = await proxyHostModel.query().where("certificate_id", ">", 0).andWhere("is_deleted", 0);

			for (const host of proxyHosts) {
				if (!activeCertIds.includes(host.certificate_id)) {
					logger.warn(
						`Cleaning up proxy_host ${host.id} due to missing certificate_id ${host.certificate_id}`,
					);
					await proxyHostModel.query().where("id", host.id).patch({
						certificate_id: 0,
						ssl_forced: 0,
						http2_support: 0,
						hsts_enabled: 0,
						hsts_subdomains: 0,
					});
					const updatedHost = await proxyHostModel.query().findById(host.id);
					await internalNginx.configure(proxyHostModel, "proxy_host", updatedHost, { skip_reload: true });
					reloadRequired = true;
				}
			}

			// Find redirection hosts pointing to certificates
			const redirectionHosts = await redirectionHostModel
				.query()
				.where("certificate_id", ">", 0)
				.andWhere("is_deleted", 0);

			for (const host of redirectionHosts) {
				if (!activeCertIds.includes(host.certificate_id)) {
					logger.warn(
						`Cleaning up redirection_host ${host.id} due to missing certificate_id ${host.certificate_id}`,
					);
					await redirectionHostModel.query().where("id", host.id).patch({
						certificate_id: 0,
						ssl_forced: 0,
						http2_support: 0,
						hsts_enabled: 0,
						hsts_subdomains: 0,
					});
					const updatedHost = await redirectionHostModel.query().findById(host.id);
					await internalNginx.generateConfig("redirection_host", updatedHost);
					if (updatedHost.meta) {
						updatedHost.meta.nginx_online = true;
						updatedHost.meta.nginx_err = null;
						await redirectionHostModel.query().where("id", host.id).patch({ meta: updatedHost.meta });
					}
					reloadRequired = true;
				}
			}

			// Find dead hosts pointing to certificates
			const deadHosts = await deadHostModel.query().where("certificate_id", ">", 0).andWhere("is_deleted", 0);

			for (const host of deadHosts) {
				if (!activeCertIds.includes(host.certificate_id)) {
					logger.warn(
						`Cleaning up dead_host ${host.id} due to missing certificate_id ${host.certificate_id}`,
					);
					await deadHostModel.query().where("id", host.id).patch({
						certificate_id: 0,
						ssl_forced: 0,
						http2_support: 0,
						hsts_enabled: 0,
						hsts_subdomains: 0,
					});
					const updatedHost = await deadHostModel.query().findById(host.id);
					await internalNginx.generateConfig("dead_host", updatedHost);
					if (updatedHost.meta) {
						updatedHost.meta.nginx_online = true;
						updatedHost.meta.nginx_err = null;
						await deadHostModel.query().where("id", host.id).patch({ meta: updatedHost.meta });
					}
					reloadRequired = true;
				}
			}

			// Find streams pointing to certificates
			const streams = await streamModel.query().where("certificate_id", ">", 0).andWhere("is_deleted", 0);

			for (const host of streams) {
				if (!activeCertIds.includes(host.certificate_id)) {
					logger.warn(`Cleaning up stream ${host.id} due to missing certificate_id ${host.certificate_id}`);
					await streamModel.query().where("id", host.id).patch({ certificate_id: 0 });
					const updatedHost = await streamModel.query().findById(host.id);
					await internalNginx.generateConfig("stream", updatedHost);
					if (updatedHost.meta) {
						updatedHost.meta.nginx_online = true;
						updatedHost.meta.nginx_err = null;
						await streamModel.query().where("id", host.id).patch({ meta: updatedHost.meta });
					}
					reloadRequired = true;
				}
			}

			if (reloadRequired) {
				logger.info("Reloading Nginx after missing certificate cleanup...");
				await internalNginx.reload();
			}
		} catch (err) {
			logger.error(`Error during missing certificate cleanup: ${err.message}`);
		}
	},

	/**
	 * Triggered by a timer, this will check for expiring hosts and renew their tls certs if required
	 */
	processExpiringHosts: async () => {
		if (!internalCertificate.intervalProcessing && !internalCertificate.processing) {
			internalCertificate.intervalProcessing = true;
			internalCertificate.processing = true;
			logger.info("Renewing Certbot TLS certs close to expiry...");

			try {
				const result = await utils.execFile("certbot", [
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

				await internalNginx.reload();
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
		const thisData = /** @type {any} */ (data);
		await access.can("certificates:create", thisData);
		thisData.owner_user_id = access.token.getUserId(1);

		if (thisData.provider === "letsencrypt" || thisData.provider === "internal") {
			thisData.nice_name = thisData.domain_names.join(", ");
		}

		// this command really should clean up and delete the cert if it can't fully succeed
		const certificate = await certificateModel.query().insertAndFetch(/** @type {any} */ (thisData));

		try {
			if (certificate.provider === "letsencrypt") {
				// Request a new Cert with Certbot. Let the fun begin.
				if (certificate.meta?.dns_challenge) {
					await internalCertificate.requestCertbotWithDnsChallenge(certificate);
				} else {
					await internalCertificate.requestCertbot(certificate);
				}

				// At this point, the letsencrypt cert should exist on disk.
				// Lets get the expiry date from the file and update the row silently
				try {
					const certInfo = await internalCertificate.getCertificateInfoFromFile(
						`${internalCertificate.getLiveCertPath(certificate.id)}/fullchain.pem`,
					);
					const savedRow = await certificateModel
						.query()
						.patchAndFetchById(certificate.id, {
							expires_on: /** @type {any} */ (
								dayjs.unix(certInfo.dates.to).format("YYYY-MM-DD HH:mm:ss")
							),
						})
						.then(/** @type {any} */ (utils.omitRow(omissions())));

					// Add cert data for audit log
					savedRow.meta = _.assign({}, savedRow.meta, {
						letsencrypt_certificate: certInfo,
					});

					await internalCertificate.addCreatedAuditLog(access, certificate.id, savedRow);

					return savedRow;
				} catch (err) {
					// Delete the certificate from the database if it was not created successfully
					await certificateModel.query().deleteById(certificate.id);
					// Mark as public so the user sees the real error
					err.public = true;
					throw err;
				}
			} else if (certificate.provider === "internal") {
				try {
					const outDir = `/data/tls/internal/npm-${certificate.id}`;
					const result = await internalPki.createLeadCert(
						{
							domain_names: certificate.domain_names,
							years: Number.parseInt(certificate.meta.years, 10) || 10,
						},
						outDir,
					);

					// Get Cert Info to set expiry properly
					const certInfo = await internalCertificate.getCertificateInfoFromFile(result.fullchain);
					const savedRow = await certificateModel
						.query()
						.patchAndFetchById(certificate.id, {
							expires_on: /** @type {any} */ (
								dayjs.unix(certInfo.dates.to).format("YYYY-MM-DD HH:mm:ss")
							),
							meta: _.assign({}, certificate.meta, {
								certificate: result.fullchain,
								certificate_key: result.privkey,
							}),
						})
						.then(/** @type {any} */ (utils.omitRow(omissions())));

					await internalCertificate.addCreatedAuditLog(access, certificate.id, savedRow);
					return savedRow;
				} catch (err) {
					await certificateModel.query().deleteById(certificate.id);
					throw err;
				}
			}
		} catch (err) {
			// Delete the certificate here. This is a hard delete, since it never existed properly
			await certificateModel.query().deleteById(certificate.id);
			// Mark as public so the user sees the real error
			err.public = true;
			throw err;
		}

		data.meta = _.assign({}, data.meta || {}, certificate.meta);

		// Add to audit log
		await internalCertificate.addCreatedAuditLog(access, certificate.id, utils.omitRow(omissions())(data));

		internalGitOps.triggerAutoPush("certificate");

		return utils.omitRow(omissions())(certificate);
	},

	addCreatedAuditLog: async (access, certificate_id, meta) => {
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "certificate",
			object_id: certificate_id,
			meta: meta,
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
	get: async (access, data) => {
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
		// Custom omissions
		if (typeof thisData.omit !== "undefined" && thisData.omit !== null) {
			return _.omit(row, [...thisData.omit]);
		}

		return internalCertificate.cleanExpansions(row);
	},

	cleanExpansions: (row) => {
		if (typeof row.proxy_hosts !== "undefined") {
			row.proxy_hosts = utils.omitRows(["is_deleted"])(row.proxy_hosts);
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
		await access.can("certificates:get", data);
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

		const downloadName = `npm-${data.id}-${Date.now()}.zip`;
		const opName = `/tmp/${downloadName}`;

		await internalCertificate.zipFiles(certFilesWithRealPaths, opName);
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
		const stream = fs.createWriteStream(out);

		return new Promise((resolve, reject) => {
			source.map((fl) => {
				const fileName = path.basename(fl);
				debug(logger, fl, "added to certificate zip");
				archive.file(fl, { name: fileName });
				return true;
			});
			archive.on("error", (err) => reject(err)).pipe(stream);
			stream.on("close", () => resolve());
			archive.finalize();
		});
	},

	/**
	 * @param {import("../lib/types.js").Access}  access
	 * @param {Object}  data
	 * @param {Number}  data.id
	 * @param {String}  [data.reason]
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		await access.can("certificates:delete", data.id);
		const row = await internalCertificate.get(access, { id: data.id });

		if (!row?.id) {
			throw new error.ItemNotFoundError(data.id);
		}

		await certificateModel.query().where("id", row.id).patch({
			is_deleted: 1,
		});

		// Add to audit log
		row.meta = internalCertificate.cleanMeta(row.meta);

		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "certificate",
			object_id: row.id,
			meta: _.omit(row, omissions()),
		});

		if (row.provider === "letsencrypt") {
			// Revoke the cert
			await internalCertificate.revokeCertbot(row);
		} else {
			await fs.promises.rm(`/data/tls/custom/npm-${row.id}`, { force: true, recursive: true });
			await fs.promises.rm(`/data/tls/custom/npm-${row.id}.der`, { force: true });
		}

		await internalCertificate.cleanUpMissingCertificates();

		internalGitOps.triggerAutoPush("certificate");

		return true;
	},

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
	writeCustomCert: async (certificate) => {
		logger.info("Writing Custom Certificate:", {
			...certificate,
			meta: internalCertificate.cleanMeta({ ...certificate.meta }, false),
		});

		const dir = `/data/tls/custom/npm-${certificate.id}`;

		if (certificate.provider === "letsencrypt" || certificate.provider === "internal") {
			throw new Error("Refusing to write certbot/internal certs here");
		}

		let certData = certificate.meta.certificate;
		if (typeof certificate.meta.intermediate_certificate !== "undefined") {
			certData = `${certData}\n${certificate.meta.intermediate_certificate}`;
		}

		if (!fs.existsSync(dir)) {
			await fs.promises.mkdir(dir);
		}

		await fs.promises.writeFile(`${dir}/fullchain.pem`, certData);
		await fs.promises.writeFile(`${dir}/privkey.pem`, certificate.meta.certificate_key);
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
	upload: async (access, data) => {
		const row = await internalCertificate.get(access, { id: data.id });
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

		const certificate = await internalCertificate.update(
			access,
			/** @type {any} */ ({
				id: data.id,
				expires_on: /** @type {any} */ (
					dayjs.unix(validations.certificate.dates.to).format("YYYY-MM-DD HH:mm:ss")
				),
				domain_names: Array.from(
					new Set([validations.certificate.cn, ...(validations.certificate.sans || [])]),
				),
				meta: _.clone(row.meta), // Prevent the update method from changing this value that we'll use later
			}),
		);

		certificate.meta = row.meta;
		await internalCertificate.writeCustomCert(certificate);
		return _.pick(row.meta, internalCertificate.allowedSslFiles);
	},

	/**
	 * Uses the openssl command to validate the private key.
	 * It will save the file to disk first, then run commands on it, then delete the file.
	 *
	 * @param {String}  privateKey    This is the entire key contents as a string
	 */
	checkPrivateKey: async (privateKey) => {
		const filepath = await tempWrite(privateKey, "key.pem");

		const timeoutPromise = new Promise((_, reject) => {
			setTimeout(
				() =>
					reject(
						new error.ValidationError(
							"Result Validation Error: Validation timed out. This could be due to the key being passphrase-protected.",
						),
					),
				10000,
			);
		});

		const checkPromise = (async () => {
			const result = await utils.execFile("openssl", ["pkey", "-in", filepath, "-check", "-noout"]);
			if (!result.toLowerCase().includes("key is valid")) {
				throw new error.ValidationError(`Result Validation Error: ${result}`);
			}
			return true;
		})();

		try {
			const result = await Promise.race([checkPromise, timeoutPromise]);
			fs.unlinkSync(filepath);
			return result;
		} catch (err) {
			try {
				fs.unlinkSync(filepath);
			} catch {
				/* ignore cleanup error */
			}
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
			const regex = /(?:subject=)?[^=]+=\s*(\S+)/gim;
			const match = regex.exec(result);
			if (match && typeof match[1] !== "undefined") {
				certData.cn = match[1];
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
					const date = dayjs(dateString, "MMM D HH:mm:ss YYYY z").unix();

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
		internalCertificate.allowedSslFiles.map((key) => {
			if (typeof meta[key] !== "undefined" && meta[key]) {
				if (remove) {
					delete meta[key];
				} else {
					meta[key] = true;
				}
			}
			return true;
		});
		return meta;
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
	renew: async (access, data) => {
		await access.can("certificates:update", data);
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

			// Add to audit log
			await internalAuditLog.add(access, {
				action: "renewed",
				object_type: "certificate",
				object_id: updatedCertificate.id,
				meta: updatedCertificate,
			});

			return updatedCertificate;
		}

		throw new error.ValidationError("Only Certbot certificates can be renewed");
	},

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
	 * @returns {Promise}
	 */
	revokeCertbot: (certificate, throwErrors) => certbot.revokeCertbot(certificate, throwErrors),

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
