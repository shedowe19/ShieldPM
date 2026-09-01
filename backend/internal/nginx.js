import crypto from "node:crypto";
import fs from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dayjs from "dayjs";
import _ from "lodash";
import punycode from "punycode.js";
import { decrypt } from "../lib/encryption.js";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { debug, nginx as logger } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import internalAnubis from "./anubis.js";

let nginxMutationTail = Promise.resolve();

const withNginxMutationLock = async (callback) => {
	const previous = nginxMutationTail;
	let release;
	nginxMutationTail = new Promise((resolve) => {
		release = resolve;
	});
	await previous;
	try {
		return await callback();
	} finally {
		release();
	}
};

/**
 * @param {Error} error
 * @param {PromiseSettledResult<unknown>[]} rollbackResults
 */
const rollbackMessage = (error, rollbackResults) => {
	const failures = rollbackResults
		.filter((result) => result.status === "rejected")
		.map((result) => result.reason?.message || String(result.reason));
	return failures.length ? `${error.message}; rollback errors: ${failures.join("; ")}` : error.message;
};

const internalNginx = {
	/**
	 * This will:
	 * - test the nginx config first to make sure it's OK
	 * - create / recreate the config for the host
	 * - test again
	 * - IF OK:  update the meta with online status
	 * - IF BAD: update the meta with offline status and rename the config
	 * - then reload nginx
	 *
	 * @param   {Object|String}  model
	 * @param   {String}         host_type
	 * @param   {Object}         host
	 * @returns {Promise}
	 */
	configure: async (model, host_type, host, options = {}) => {
		return await withNginxMutationLock(async () => {
			const skipReload = options.skip_reload || false;
			const filename = internalNginx.getConfigName(internalNginx.getFileFriendlyHostType(host_type), host.id);
			const stage = `${filename}.stage-${crypto.randomUUID()}`;
			const backup = `${filename}.backup-${crypto.randomUUID()}`;
			let hasBackup = false;
			let activated = false;
			let renderHost = host;
			if (host_type === "proxy_host" && host.forward_scheme === "terminal" && !host.terminal_gateway_secret) {
				const stored = await model.query().findById(host.id).select("terminal_gateway_secret");
				renderHost = { ...host, terminal_gateway_secret: stored?.terminal_gateway_secret };
			}

			try {
				await internalNginx.generateConfig(host_type, renderHost, { filename: stage });
				try {
					await fs.promises.copyFile(filename, backup, fs.constants.COPYFILE_EXCL);
					hasBackup = true;
				} catch (error) {
					if (error.code !== "ENOENT") throw error;
				}
				await fs.promises.rename(stage, filename);
				activated = true;
				await internalNginx.test();
				if (!skipReload) await internalNginx.reload();

				const combinedMeta = _.assign({}, host.meta, { nginx_online: true, nginx_err: null });
				await model.query().where("id", host.id).patch({ meta: combinedMeta });
				if (hasBackup) await fs.promises.unlink(backup);
				void Promise.resolve(internalAnubis.generatePolicy()).catch((error) => {
					logger.error(`Anubis policy regeneration failed: ${error.message}`);
				});
				return combinedMeta;
			} catch (error) {
				logger.error(`Nginx configuration activation failed: ${error.message}`);
				const removalResults = /** @type {PromiseSettledResult<unknown>[]} */ ([]);
				if (activated) {
					removalResults.push(
						...(await Promise.allSettled([
							fs.promises.unlink(filename).catch((unlinkError) => {
								if (unlinkError.code !== "ENOENT") throw unlinkError;
							}),
						])),
					);
				}
				const restoreResults = /** @type {PromiseSettledResult<unknown>[]} */ (
					await Promise.allSettled([
						hasBackup ? fs.promises.rename(backup, filename) : Promise.resolve(),
						fs.promises.unlink(stage).catch((unlinkError) => {
							if (unlinkError.code !== "ENOENT") throw unlinkError;
						}),
					])
				);
				restoreResults.push(
					...(await Promise.allSettled([
						internalNginx
							.test()
							.then(() => (skipReload ? undefined : utils.execFile("nginx", ["-s", "reload"]))),
					])),
				);
				throw new errs.ConfigurationError(
					`Nginx configuration was rejected and rolled back: ${rollbackMessage(error, [
						...removalResults,
						...restoreResults,
					])}`,
					error,
				);
			} finally {
				await fs.promises.unlink(stage).catch(() => {});
			}
		});
	},

	/**
	 * @returns {Promise}
	 */
	test: async () => {
		return utils.execFile("nginx", ["-tq"]);
	},

	/**
	 * @returns {Promise}
	 */
	reload: async () => {
		const promises = [];

		if (process.env.ACME_OCSP_STAPLING === "true") {
			promises.push(
				utils
					.execFile("certbot-ocsp-fetcher.sh", [
						"-c",
						"/data/tls/certbot/live",
						"-o",
						"/data/tls/certbot/live",
						"--no-reload-webserver",
						"--quiet",
					])
					.catch(() => {}),
			);
		}

		if (process.env.CUSTOM_OCSP_STAPLING === "true") {
			promises.push(
				utils
					.execFile("certbot-ocsp-fetcher.sh", [
						"-c",
						"/data/tls/custom",
						"-o",
						"/data/tls/custom",
						"--no-reload-webserver",
						"--quiet",
					])
					.catch(() => {}),
			);
		}

		await Promise.all(promises);

		await internalNginx.test();
		await utils.execFile("nginx", ["-s", "reload"]);
	},

	/**
	 * @param   {String}  host_type
	 * @param   {number} host_id
	 * @returns {String}
	 */
	getConfigName: (host_type, host_id) => {
		if (host_type === "default") {
			return "/usr/local/nginx/conf/conf.d/default.conf";
		}
		return `/data/nginx/${internalNginx.getFileFriendlyHostType(host_type)}/${host_id}.conf`;
	},

	/**
	 * Generates custom locations
	 * @param   {Object}  host
	 * @returns {Promise}
	 */
	renderLocations: async (host) => {
		const renderEngine = utils.getRenderEngine();
		const templatePath = `${__dirname}/../templates/_proxy_host_custom_location.conf`;

		const renderedLocationsArray = await Promise.all(
			host.locations.map(async (location) => {
				const locationCopy = Object.assign(
					{},
					{ access_list_id: host.access_list_id },
					{ certificate_id: host.certificate_id },
					{ ssl_forced: host.ssl_forced },
					{ caching_enabled: host.caching_enabled },
					{ block_exploits: host.block_exploits },
					{ allow_websocket_upgrade: host.allow_websocket_upgrade },
					{ http2_support: host.http2_support },
					{ hsts_enabled: host.hsts_enabled },
					{ hsts_subdomains: host.hsts_subdomains },
					{ access_list: host.access_list },
					{ certificate: host.certificate },
					location,
				);

				if (
					locationCopy.forward_host.indexOf("/") > -1 &&
					!locationCopy.forward_host.startsWith("/") &&
					!locationCopy.forward_host.startsWith("unix")
				) {
					const split = locationCopy.forward_host.split("/");

					locationCopy.forward_host = split.shift();
					locationCopy.forward_path = `/${split.join("/")}`;
				}
				locationCopy.env = process.env;

				return await renderEngine.renderFile(templatePath, locationCopy);
			}),
		);

		return renderedLocationsArray.join("");
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  host_row
	 * @returns {Promise}
	 */
	generateConfig: async (host_type, host_row, options = {}) => {
		if (!options.filename && !options.mutation_locked) {
			return await withNginxMutationLock(() =>
				internalNginx.generateConfig(host_type, host_row, { ...options, mutation_locked: true }),
			);
		}
		// Prevent modifying the original object:
		const host = JSON.parse(JSON.stringify(host_row));
		const nice_host_type = internalNginx.getFileFriendlyHostType(host_type);

		const renderEngine = utils.getRenderEngine();
		const canonicalFilename = internalNginx.getConfigName(nice_host_type, host.id);
		const filename = options.filename || `${canonicalFilename}.stage-${crypto.randomUUID()}`;
		const activateAfterRender = !options.filename;
		const templatePath = `${__dirname}/../templates/${nice_host_type}.conf`;

		let origLocations;

		// Manipulate the data a bit before sending it to the template
		if (nice_host_type !== "default") {
			host.use_default_location = true;
			if (typeof host.advanced_config !== "undefined" && host.advanced_config) {
				host.use_default_location = !internalNginx.advancedConfigHasDefaultLocation(host.advanced_config);
			}
		}

		// For redirection hosts, if the scheme is not http or https, set it to $scheme
		if (
			nice_host_type === "redirection_host" &&
			["http", "https"].indexOf(host.forward_scheme.toLowerCase()) === -1
		) {
			host.forward_scheme = "$scheme";
		}

		if (host.locations) {
			origLocations = [].concat(host.locations);
			const renderedLocations = await internalNginx.renderLocations(host);
			host.locations = renderedLocations;

			// Allow someone who is using / custom location path to use it, and skip the default / location
			_.map(host.locations, (location) => {
				if (location.path === "/") {
					host.use_default_location = false;
				}
			});
		}

		if (
			host.forward_host &&
			host.forward_host.indexOf("/") > -1 &&
			!host.forward_host.startsWith("/") &&
			!host.forward_host.startsWith("unix")
		) {
			const split = host.forward_host.split("/");

			host.forward_host = split.shift();
			host.forward_path = `/${split.join("/")}`;
		}

		if (host.domain_names) {
			host.server_names = host.domain_names.map((domain_name) => punycode.toASCII(domain_name));
		}

		host.env = process.env;
		if (nice_host_type === "proxy_host" && host.forward_scheme === "terminal" && host.enabled) {
			try {
				host.terminal_gateway_secret_plain = decrypt(host.terminal_gateway_secret);
			} catch (err) {
				throw new errs.ConfigurationError("Terminal gateway secret could not be decrypted", err);
			}
			delete host.terminal_gateway_secret;
		}

		if (host.certificate && host.certificate.provider === "internal") {
			host.use_ml_kem = true;
		}

		// Maintenance Mode Logic
		const now = dayjs();
		host.maintenance_mode = false;
		if (host.maintenance_active) {
			host.maintenance_mode = true;
		} else if (host.maintenance_start && host.maintenance_end) {
			const start = dayjs(host.maintenance_start);
			const end = dayjs(host.maintenance_end);
			if (now.isAfter(start) && now.isBefore(end)) {
				host.maintenance_mode = true;
			}
		}

		// Calculate index_dir if index_file is set and contains a path separator
		if (host.index_file?.includes("/")) {
			const indexDir = dirname(host.index_file);
			if (indexDir && indexDir !== ".") {
				host.index_dir = indexDir;
			}
		}

		try {
			await fs.promises.mkdir(dirname(filename), { recursive: true, mode: 0o700 });
			const config_text = await renderEngine.renderFile(templatePath, host);
			const handle = await fs.promises.open(filename, "wx", 0o600);
			try {
				await handle.writeFile(config_text, "utf8");
				await handle.sync();
			} finally {
				await handle.close();
			}
			debug(logger, "Wrote config:", filename);

			// Restore locations array
			host.locations = origLocations;
		} catch (err) {
			debug(logger, `Could not write ${filename}:`, err.message);
			await fs.promises.unlink(filename).catch(() => {});
			throw new errs.ConfigurationError(err.message);
		}

		if (process.env.DISABLE_NGINX_BEAUTIFIER !== "true") {
			try {
				await utils.execFile("nginxbeautifier", ["-s", "4", filename]);
			} catch {
				// ignore beautifier errors
			}
		}
		await fs.promises.chmod(filename, 0o600);
		const renderedHandle = await fs.promises.open(filename, "r+");
		try {
			await renderedHandle.sync();
		} finally {
			await renderedHandle.close();
		}

		if (activateAfterRender) {
			const backup = `${canonicalFilename}.backup-${crypto.randomUUID()}`;
			let hasBackup = false;
			let activated = false;
			try {
				try {
					await fs.promises.copyFile(canonicalFilename, backup, fs.constants.COPYFILE_EXCL);
					hasBackup = true;
				} catch (error) {
					if (error.code !== "ENOENT") throw error;
				}
				await fs.promises.rename(filename, canonicalFilename);
				activated = true;
				await internalNginx.test();
				if (hasBackup) await fs.promises.unlink(backup);
			} catch (error) {
				const rollbackResults = [];
				if (activated) {
					rollbackResults.push(
						...(await Promise.allSettled([
							fs.promises.unlink(canonicalFilename).catch((unlinkError) => {
								if (unlinkError.code !== "ENOENT") throw unlinkError;
							}),
						])),
					);
				}
				rollbackResults.push(
					...(await Promise.allSettled([
						hasBackup ? fs.promises.rename(backup, canonicalFilename) : Promise.resolve(),
						fs.promises.unlink(filename).catch((unlinkError) => {
							if (unlinkError.code !== "ENOENT") throw unlinkError;
						}),
					])),
				);
				rollbackResults.push(...(await Promise.allSettled([internalNginx.test()])));
				throw new errs.ConfigurationError(
					`Could not atomically activate ${canonicalFilename}: ${rollbackMessage(error, rollbackResults)}`,
					error,
				);
			}
		}

		return true;
	},

	/**
	 * A simple wrapper around unlinkSync that writes to the logger
	 *
	 * @param   {String}  filename
	 */
	deleteFile: async (filename) => {
		try {
			await fs.promises.access(filename);
		} catch {
			return; // file doesn't exist
		}

		try {
			debug(logger, `Deleting file: ${filename}`);
			await fs.promises.unlink(filename);
		} catch (err) {
			debug(logger, "Could not delete file:", JSON.stringify(err, null, 2));
		}
	},

	/**
	 *
	 * @param   {String} host_type
	 * @returns String
	 */
	getFileFriendlyHostType: (host_type) => {
		return host_type.replace(/-/g, "_");
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  [host]
	 * @returns {Promise}
	 */
	deleteConfig: async (host_type, host, options = {}) => {
		return await withNginxMutationLock(async () => {
			const configFile = internalNginx.getConfigName(
				internalNginx.getFileFriendlyHostType(host_type),
				typeof host === "undefined" ? 0 : host.id,
			);
			const staged = `${configFile}.delete-${crypto.randomUUID()}`;
			try {
				await fs.promises.rename(configFile, staged);
			} catch (error) {
				if (error.code === "ENOENT") {
					await internalNginx.deleteFile(`${configFile}.err`);
					return;
				}
				throw new errs.ConfigurationError(`Could not stage Nginx config deletion: ${error.message}`, error);
			}

			try {
				await internalNginx.test();
				if (!options.skip_reload) await internalNginx.reload();
				await fs.promises.unlink(staged);
				await internalNginx.deleteFile(`${configFile}.err`);
			} catch (error) {
				const rollbackResults = /** @type {PromiseSettledResult<unknown>[]} */ (
					await Promise.allSettled([fs.promises.rename(staged, configFile)])
				);
				rollbackResults.push(
					...(await Promise.allSettled([
						internalNginx
							.test()
							.then(() => (options.skip_reload ? undefined : utils.execFile("nginx", ["-s", "reload"]))),
					])),
				);
				throw new errs.ConfigurationError(
					`Nginx config deletion was rejected and rolled back: ${rollbackMessage(error, rollbackResults)}`,
					error,
				);
			}
		});
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  [host]
	 * @returns {Promise}
	 */
	renameConfigAsError: async (host_type, host) => {
		const config_file = internalNginx.getConfigName(
			internalNginx.getFileFriendlyHostType(host_type),
			typeof host === "undefined" ? 0 : host.id,
		);

		try {
			await fs.promises.rename(config_file, `${config_file}.err`);
		} catch {
			// ignore if file doesn't exist
		}
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  host
	 * @returns {Promise}
	 */
	backupConfig: async (host_type, host) => {
		const config_file = internalNginx.getConfigName(internalNginx.getFileFriendlyHostType(host_type), host.id);
		const backup_file = `${config_file}.bak`;

		try {
			await fs.promises.copyFile(config_file, backup_file);
			debug(logger, `Backed up config: ${config_file} -> ${backup_file}`);
		} catch (err) {
			// Ignore if original file doesn't exist (new host)
			if (err.code !== "ENOENT") {
				logger.error(`Failed to backup config: ${err.message}`);
			}
		}
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  host
	 * @returns {Promise}
	 */
	restoreConfig: async (host_type, host) => {
		const config_file = internalNginx.getConfigName(internalNginx.getFileFriendlyHostType(host_type), host.id);
		const backup_file = `${config_file}.bak`;

		try {
			await fs.promises.rename(backup_file, config_file);
			debug(logger, `Restored config: ${backup_file} -> ${config_file}`);
		} catch (err) {
			// Ignore if backup doesn't exist
			if (err.code !== "ENOENT") {
				logger.error(`Failed to restore config: ${err.message}`);
			}
		}
	},

	/**
	 * @param   {String}  host_type
	 * @param   {Object}  host
	 * @returns {Promise}
	 */
	deleteBackupConfig: async (host_type, host) => {
		const config_file = internalNginx.getConfigName(internalNginx.getFileFriendlyHostType(host_type), host.id);
		const backup_file = `${config_file}.bak`;

		await internalNginx.deleteFile(backup_file);
	},

	/**
	 * @param   {String}  hostType
	 * @param   {Array}   hosts
	 * @returns {Promise}
	 */
	bulkGenerateConfigs: async (model, hostType, hosts) => {
		for (const host of hosts) {
			await internalNginx.configure(model, hostType, host, { skip_reload: true });
		}
	},

	/**
	 * @param   {string}  cfg
	 * @returns {boolean}
	 */
	advancedConfigHasDefaultLocation: (cfg) => !!cfg.match(/^(?:.*;)?\s*?location\s*?\/\s*?{/im),

	/**
	 * Read nginx log file contents.
	 * @param   {import("../lib/types.js").Access}  access
	 * @param   {"error"|"access"}  logType
	 * @returns {Promise<string>}
	 */
	getLogs: async (access, logType) => {
		await access.can("settings:read");
		const dataPath = process.env.DATA_PATH || "/data";
		const logPaths = {
			error: `${dataPath}/nginx/error.log`,
			access: `${dataPath}/nginx/access.log`,
			json_access: `${dataPath}/nginx/json_access.log`,
			stream: `${dataPath}/nginx/stream.log`,
		};
		const logPath = logPaths[logType] || logPaths.error;
		try {
			return await fs.promises.readFile(logPath, "utf8");
		} catch (err) {
			if (err.code === "ENOENT") {
				return `Log file not found: ${logPath}`;
			}
			throw err;
		}
	},
};

export default internalNginx;
