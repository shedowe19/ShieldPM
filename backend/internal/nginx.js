import fs from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import dayjs from "dayjs";
import _ from "lodash";
import punycode from "punycode.js";
import errs from "../lib/error.js";
import { getTerminalAccessToken } from "../lib/terminal-access.js";
import utils from "../lib/utils.js";
import { debug, nginx as logger } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import internalAnubis from "./anubis.js";

let configurationQueue = Promise.resolve();

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
	configure: (model, host_type, host, options = {}) =>
		internalNginx.withConfigurationLock(() => internalNginx.configureHost(model, host_type, host, options)),

	/** Serialize config changes and certificate activation; callbacks must not call configure(). */
	withConfigurationLock: (callback) => {
		const operation = configurationQueue.then(callback);
		configurationQueue = operation.catch(() => {});
		return operation;
	},

	configureHost: async (model, host_type, hostSnapshot, options = {}) => {
		const skip_reload = options.skip_reload || false;
		let combined_meta = {};
		// Bulk jobs may have loaded this snapshot before a concurrent disable/delete completed.
		const current = await model.query().findById(hostSnapshot.id).select("enabled", "is_deleted");
		const host =
			!current || current.is_deleted || !current.enabled ? { ...hostSnapshot, enabled: false } : hostSnapshot;

		// 1. Backup existing config if it exists
		await internalNginx.backupConfig(host_type, host);

		// 2. Generate new config (overwrites existing if any)
		try {
			await internalNginx.generateConfig(host_type, host);
		} catch (err) {
			logger.error(`Generation failed: ${err.message}`);
			await internalNginx.renameConfigAsError(host_type, host);
			// Restore backup if generation fails
			await internalNginx.restoreConfig(host_type, host);
			throw err;
		}

		try {
			// 3. Test nginx configuration
			// reload() already validates the complete configuration before signalling Nginx.
			// Bulk writes still need validation even though activation is deferred.
			if (skip_reload) await internalNginx.test();
			else await internalNginx.reload();

			// 4. Verification successful
			combined_meta = _.assign({}, host.meta, {
				nginx_online: Boolean(host.enabled),
				nginx_err: null,
			});

			await model.query().where("id", host.id).patch({
				meta: combined_meta,
			});

			// 5. Delete backup (commit change)
			await internalNginx.deleteBackupConfig(host_type, host);

			// 6. Regenerate Anubis Policy (async, don't block)
			Promise.resolve()
				.then(() => internalAnubis.generatePolicy())
				.catch((err) => logger.error(`Anubis policy generation failed: ${err.message}`));
		} catch (err) {
			logger.error(`Nginx test failed: ${err.message}`);

			// 6. Config is bad: Restore previous config
			// First, move the bad config to .err for debugging
			await internalNginx.renameConfigAsError(host_type, host);
			// Then restore the working backup
			await internalNginx.restoreConfig(host_type, host);

			// Update meta with error
			combined_meta = _.assign({}, host.meta, {
				nginx_online: false,
				nginx_err: `[Rolled back] Configuration failed: ${err.message}`,
			});

			if (!skip_reload) await internalNginx.reload();
			await model.query().where("id", host.id).patch({
				meta: combined_meta,
			});
		}
		return combined_meta;
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
			return "/data/nginx/default.conf";
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
					{ anubis_enabled: host.anubis_enabled },
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
				locationCopy.managed_web_root =
					locationCopy.forward_scheme === "path" && locationCopy.forward_host.startsWith("/data/websites/");

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
	generateConfig: async (host_type, host_row) => {
		// Prevent modifying the original object:
		const host = JSON.parse(JSON.stringify(host_row));
		if (host.is_deleted) host.enabled = false;
		const nice_host_type = internalNginx.getFileFriendlyHostType(host_type);

		const renderEngine = utils.getRenderEngine();
		const filename = internalNginx.getConfigName(nice_host_type, host.id);
		const templatePath = `${__dirname}/../templates/${nice_host_type}.conf`;

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
			// Allow someone who is using / custom location path to use it, and skip the default / location
			if (host.locations.some((location) => location.path === "/")) {
				host.use_default_location = false;
			}
			host.locations = await internalNginx.renderLocations(host);
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
			host.server_names = host.domain_names.map((domain_name) =>
				domain_name.startsWith("~") ? domain_name : punycode.toASCII(domain_name.toLowerCase()),
			);
		}

		host.env = process.env;
		if (host.access_list?.meta?.oauth2_proxy_prefix) {
			host.access_list.meta.oauth2_proxy_prefix = host.access_list.meta.oauth2_proxy_prefix.replace(/\/?$/, "/");
		}
		if (host.forward_scheme === "terminal") {
			host.terminal_access_token = getTerminalAccessToken(host.id);
		}
		host.managed_web_root = host.forward_scheme === "path" && host.forward_host?.startsWith("/data/websites/");

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
			if (!now.isBefore(start) && now.isBefore(end)) {
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
			const config_text = await renderEngine.renderFile(templatePath, host);
			await fs.promises.writeFile(filename, config_text, { encoding: "utf8" });
			debug(logger, "Wrote config:", filename);
		} catch (err) {
			debug(logger, `Could not write ${filename}:`, err.message);
			throw new errs.ConfigurationError(err.message);
		}

		if (process.env.DISABLE_NGINX_BEAUTIFIER !== "true") {
			try {
				await utils.execFile("nginxbeautifier", ["-s", "4", filename]);
			} catch {
				// ignore beautifier errors
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
			debug(logger, `Deleting file: ${filename}`);
			await fs.promises.unlink(filename);
		} catch (err) {
			if (err.code === "ENOENT") return;
			debug(logger, "Could not delete file:", JSON.stringify(err, null, 2));
			throw err;
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
	deleteConfig: async (host_type, host) => {
		const config_file = internalNginx.getConfigName(
			internalNginx.getFileFriendlyHostType(host_type),
			typeof host === "undefined" ? 0 : host.id,
		);

		await internalNginx.deleteFile(config_file);
		await internalNginx.deleteFile(`${config_file}.err`);
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
		} catch (err) {
			if (err.code !== "ENOENT") throw err;
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
			// No active config means no rollback target, even if an old operation left a backup.
			if (err.code === "ENOENT") {
				await internalNginx.deleteFile(backup_file);
			} else {
				logger.error(`Failed to backup config: ${err.message}`);
				throw err;
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
				throw err;
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
		// nginx -t validates every host, so another host must not be halfway through a write or rollback.
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
	 * @param   {Access}  access
	 * @param   {"error"|"access"}  logType
	 * @returns {Promise<string>}
	 */
	getLogs: async (access, logType) => {
		await access.can("settings:get");
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
