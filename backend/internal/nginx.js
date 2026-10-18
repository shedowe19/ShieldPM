import { AsyncLocalStorage } from "node:async_hooks";
import fs from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dayjs from "dayjs";
import _ from "lodash";
import punycode from "punycode.js";
import { accessListFiles } from "../lib/access-list-files.js";
import errs from "../lib/error.js";
import {
	assertAsnFirewallAvailable,
	assertConfiguredFirewallLookups,
	assertCountryFirewallAvailable,
	getFirewallGeoipStatus,
} from "../lib/firewall-geoip.js";
import { ConfigurationLexer } from "../lib/firewall-geoip-config.js";
import { compactFirewallForPreview, summarizeFirewallPreviewConfig } from "../lib/firewall-preview.js";
import { buildFirewallRender } from "../lib/firewall-render.js";
import { sanitizeHostMeta } from "../lib/host-response.js";
import { getTerminalAccessToken } from "../lib/terminal-access.js";
import utils from "../lib/utils.js";
import { redactWasmFilters } from "../lib/wasm-response.js";
import { debug, nginx as logger } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import internalAnubis from "./anubis.js";
import { prepareTrafficFiles, prepareTrafficRender } from "./host-traffic-policy.js";

/** @type {Promise<unknown>} */
let configurationQueue = Promise.resolve();
const configurationContext = new AsyncLocalStorage();
let wasmCleanupTimer;
const hasWasmLifecycleFiles = () =>
	["hosts", "active", "retirement.json"].some((name) =>
		fs.existsSync(resolve(process.env.DATA_PATH || "/data", "wasm", name)),
	);

const scheduleWasmCleanup = () => {
	if (wasmCleanupTimer) return;
	wasmCleanupTimer = setTimeout(() => {
		wasmCleanupTimer = null;
		void internalNginx
			.withConfigurationLock(async () => {
				const { collectRetiredWasmConfigurations } = await import("./wasm-lifecycle.js");
				if (await collectRetiredWasmConfigurations()) scheduleWasmCleanup();
			})
			.catch((error) => {
				logger.error(`Wasm retirement failed; files retained: ${error.message}`);
				scheduleWasmCleanup();
			});
	}, 1000);
	wasmCleanupTimer.unref?.();
};

const runConfigurationOperation = async (callback) => {
	const lifecycle = await import("./wasm-lifecycle.js");
	let context;
	try {
		context = hasWasmLifecycleFiles()
			? await lifecycle.createWasmLifecycle()
			: { active: true, initial: new Set(), hadSignal: false, lastReloadAccepted: false, accepted: null };
	} catch (error) {
		throw new errs.ConfigurationError("Cannot protect existing Wasm worker configurations", error);
	}
	const store = { active: true, lifecycle: context };
	try {
		return await configurationContext.run(store, callback);
	} finally {
		store.active = false;
		context.active = false;
		try {
			if (hasWasmLifecycleFiles() && (await lifecycle.finishWasmLifecycle(context))) scheduleWasmCleanup();
		} catch (error) {
			// The outer callback may already have committed claims/history. Observability
			// and GC failures cannot turn an accepted activation into an uncompensated error.
			logger.error(`Wasm lifecycle reconciliation failed; files retained: ${error.message}`);
			scheduleWasmCleanup();
		}
	}
};

/** Merge status into current metadata under a short row lock, after slow Nginx operations finish. */
const updateHostStatus = (model, host, status) =>
	model.transaction(async (trx) => {
		const current = await model.query(trx).findById(host.id).forUpdate();
		const meta = _.assign({}, sanitizeHostMeta(current?.meta ?? host.meta), status);
		if (current) await model.query(trx).where("id", host.id).patch({ meta });
		return meta;
	});

const performReload = async (context) => {
	if (context) return internalNginx._reloadCommands(context);
	// Test doubles may replace the queue; production always supplies its live context.
	return runConfigurationOperation(() => internalNginx._reloadCommands(configurationContext.getStore().lifecycle));
};

const internalNginx = {
	updateHostStatus,
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

	/**
	 * Serialize config changes and certificate activation; callbacks must not call configure().
	 * @template T
	 * @param {() => T | PromiseLike<T>} callback
	 * @returns {Promise<T>}
	 */
	withConfigurationLock: (callback) => {
		const operation = configurationQueue.then(() => runConfigurationOperation(callback));
		configurationQueue = operation.catch(() => {});
		return operation;
	},

	/**
	 * Refresh one render graph immediately before staging it inside the configuration lock.
	 * @param {Object} model
	 * @param {string} hostType
	 * @param {number} hostId
	 * @returns {Promise}
	 */
	getCurrentHost: async (model, hostType, hostId) => {
		const isProxy = internalNginx.getFileFriendlyHostType(hostType) === "proxy_host";
		// Join only singleton relations. Joining domains, users or clients would
		// multiply large host rows and can create a domains × users × clients result.
		const current = await model
			.query()
			.findById(hostId)
			.withGraphJoined(isProxy ? "[certificate,access_list]" : "certificate");
		if (isProxy && current) {
			await Promise.all([
				current.$fetchGraph("host_domains"),
				current.access_list?.$fetchGraph("[clients,items]"),
			]);
			// Objection's $fetchGraph skips the root $afterFind hook which normally
			// derives this legacy render field from the domain relation.
			current.domain_names = current.host_domains.map(({ domain_name }) => domain_name);
		}
		return current;
	},

	configureHost: async (model, host_type, hostSnapshot, options = {}) => {
		const skip_reload = options.skip_reload || false;
		let combined_meta = {};
		// A bulk snapshot may predate a completed host, certificate or access-list change.
		// Refresh the full render graph inside the configuration lock, not only its lifecycle flags.
		const current = await internalNginx.getCurrentHost(model, host_type, hostSnapshot.id);
		const host = !current || current.is_deleted ? { ...(current || hostSnapshot), enabled: false } : current;

		if (internalNginx.getFileFriendlyHostType(host_type) === "proxy_host") {
			host.wasm = null;
			if (host.enabled && host.meta?.wasm_filters?.some((filter) => filter.enabled)) {
				const { prepareHost } = await import("./wasm.js");
				host.wasm = await prepareHost(host);
			}
		}

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

		if (options.defer_validation) {
			return { host, host_type, model };
		}

		try {
			// 3. Test nginx configuration
			// reload() already validates the complete configuration before signalling Nginx.
			// Bulk writes still need validation even though activation is deferred.
			if (skip_reload) await internalNginx.test();
			else await internalNginx.reload();

			// 4. Verification successful
			combined_meta = await updateHostStatus(model, host, {
				nginx_online: Boolean(host.enabled),
				nginx_err: null,
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

			if (!skip_reload) await internalNginx.reload();
			// Update metadata only after restoring the running configuration, even if the database fails.
			combined_meta = await updateHostStatus(model, host, {
				nginx_online: false,
				nginx_err: `[Rolled back] Configuration failed: ${err.message}`,
			});
		}
		return combined_meta;
	},

	commitStagedConfig: async ({ host, host_type, model }, options = {}) => {
		const meta = await updateHostStatus(model, host, {
			nginx_online: Boolean(host.enabled),
			nginx_err: null,
		});
		if (!options.preserveBackup) await internalNginx.deleteBackupConfig(host_type, host);
		return meta;
	},

	rollbackStagedConfig: async ({ host, host_type, model }, err) => {
		await internalNginx.renameConfigAsError(host_type, host);
		await internalNginx.restoreConfig(host_type, host);
		return await updateHostStatus(model, host, {
			nginx_online: false,
			nginx_err: `[Rolled back] Configuration failed: ${err.message}`,
		});
	},

	/**
	 * @returns {Promise}
	 */
	test: async () => {
		const output = await utils.execFile("nginx", ["-tq"]);
		// Inspect the complete staged configuration, including new advanced directives,
		// before any reload can activate a conflicting shared country/ASN variable.
		await assertConfiguredFirewallLookups();
		return output;
	},

	/**
	 * @returns {Promise}
	 */
	reload: async () => {
		const store = configurationContext.getStore();
		if (!store?.active)
			return internalNginx.withConfigurationLock(() => performReload(configurationContext.getStore()?.lifecycle));
		return performReload(store.lifecycle);
	},

	/**
	 * @returns {Promise}
	 */
	_reloadCommands: async (context) => {
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
		const lifecycle = await import("./wasm-lifecycle.js");
		const before = context && hasWasmLifecycleFiles() ? await lifecycle.beforeWasmReload(context) : null;
		await utils.execFile("nginx", ["-s", "reload"]);
		if (context) await lifecycle.afterWasmReload(context, before);
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
					{ access_list_files: host.access_list_files },
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
				locationCopy.id = host.id;
				locationCopy.cache = host.cache;
				locationCopy.cache_ttl_seconds =
					host.cache?.routes.find((route) => route.path === location.path)?.ttl_seconds ?? null;
				locationCopy.pool = location._managed_cache_route ? host.pool : null;
				locationCopy.env = process.env;
				locationCopy.managed_web_root =
					locationCopy.forward_scheme === "path" && locationCopy.forward_host.startsWith("/data/websites/");

				return await renderEngine.renderFile(templatePath, locationCopy);
			}),
		);

		return renderedLocationsArray.join("");
	},

	/**
	 * Render a host configuration without writing it. Preview mode summarizes CIDR tables and hides terminal tokens.
	 * @param   {String}  host_type
	 * @param   {Object}  host_row
	 * @param   {{preview?: boolean}} [options]
	 * @returns {Promise<string>}
	 */
	renderConfig: async (host_type, host_row, options = {}) => {
		// Prevent modifying the original object:
		const host = JSON.parse(JSON.stringify(host_row));
		if (host.is_deleted) host.enabled = false;
		host.access_list_files = accessListFiles({ id: host.access_list_id, meta: host.access_list?.meta });
		const nice_host_type = internalNginx.getFileFriendlyHostType(host_type);
		let firewallSummaries;
		if (nice_host_type === "proxy_host" && host.enabled && host.meta?.ip_firewall?.enabled === true) {
			const geoipStatus = await getFirewallGeoipStatus();
			await assertCountryFirewallAvailable(host.meta.ip_firewall, geoipStatus);
			await assertAsnFirewallAvailable(host.meta.ip_firewall, geoipStatus);
			let lists = [];
			if (host.meta.ip_firewall.list_ids?.length) {
				// Lazy import avoids the list service/configuration engine cycle for ordinary/manual-only hosts.
				const { default: firewallLists } = await import("./firewall-list.js");
				lists = await firewallLists.getForHost(host.meta.ip_firewall.list_ids);
			}
			host.firewall = await buildFirewallRender(host, lists, {
				country: geoipStatus.available === true,
				asn: geoipStatus.asn?.available === true,
			});
			if (options.preview && host.firewall) {
				const compact = compactFirewallForPreview(host.firewall);
				host.firewall = compact.firewall;
				firewallSummaries = compact.summaries;
			}
		}

		const renderEngine = utils.getRenderEngine();
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

		if (
			options.preview &&
			nice_host_type === "proxy_host" &&
			host.enabled &&
			host.meta?.wasm_filters?.some((filter) => filter.enabled)
		) {
			// Read-only previews show the hooks without creating secret files or starting a VM.
			host.wasm = {
				configuration_path: "/data/wasm/hosts/[DRAFT].json",
				dispatcher_path: "/data/wasm/artifacts/[TRUSTED].lua",
				preview_summary: JSON.stringify(redactWasmFilters(host.meta.wasm_filters)),
			};
		}

		if (nice_host_type === "proxy_host") {
			prepareTrafficRender(host, { preview: options.preview === true });
			if (host.cache_extra_routes?.length)
				host.locations = [
					...(host.locations || []),
					...host.cache_extra_routes.map((route) => ({
						path: route.path,
						forward_scheme: host.forward_scheme,
						forward_host: host.forward_host,
						forward_port: host.forward_port,
						_managed_cache_route: true,
					})),
				];
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
			// The preview hides this value; avoid reading or initializing signing keys for an unsaved draft.
			host.terminal_access_token = options.preview ? "[REDACTED]" : getTerminalAccessToken(host.id);
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

		const rendered = await renderEngine.renderFile(templatePath, host);
		return firewallSummaries
			? summarizeFirewallPreviewConfig(rendered, host.id, { summaries: firewallSummaries }).config
			: rendered;
	},

	/**
	 * Render through the same template path used by previews, then install the host config.
	 * @param {string} host_type
	 * @param {{id: number}} host_row
	 * @returns {Promise<boolean>}
	 */
	generateConfig: async (host_type, host_row) => {
		const filename = internalNginx.getConfigName(host_type, host_row.id);
		try {
			if (internalNginx.getFileFriendlyHostType(host_type) === "proxy_host") await prepareTrafficFiles(host_row);
			const config_text = await internalNginx.renderConfig(host_type, host_row);
			await fs.promises.writeFile(filename, config_text, { encoding: "utf8" });
			debug(logger, "Wrote config:", filename);
		} catch (err) {
			debug(logger, `Could not write ${filename}:`, err.message);
			throw new errs.ConfigurationError(err.message);
		}

		// Install the rendered bytes unchanged. nginxbeautifier treats braces in
		// quoted JSON/Lua as block syntax and can truncate Nginx variable names.
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
	bulkGenerateConfigs: async (model, hostType, hosts) =>
		internalNginx.bulkGenerateConfigGroups([{ hostType, hosts, model }]),

	/**
	 * Render multiple host types into one atomic validation batch.
	 * @param {Array<{model: object, hostType: string, hosts: Array<object>}>} groups
	 * @param {{throwOnError?: boolean, reload?: boolean}} [options]
	 * @returns {Promise<Array<object>>}
	 */
	bulkGenerateConfigGroups: async (groups, options = {}) =>
		internalNginx.withConfigurationLock(() => internalNginx.bulkGenerateConfigGroupsUnlocked(groups, options)),

	/** Caller must hold withConfigurationLock; used when sidecars and DB share the activation. */
	bulkGenerateConfigGroupsUnlocked: async (groups, options = {}) => {
		/** @type {Array<{host: object, host_type: string, model: object}>} */
		const stages = [];
		try {
			for (const { model, hostType, hosts } of groups) {
				for (const host of hosts) {
					const stage = await internalNginx.configureHost(model, hostType, host, {
						defer_validation: true,
						skip_reload: true,
					});
					stages.push(/** @type {{host: object, host_type: string, model: object}} */ (stage));
				}
			}
			if (options.reload) await internalNginx.reload();
			else await internalNginx.test();
			// Every backup remains available until all status writes finish. A failure in
			// another host must not turn a completed status write into a missing listener.
			const commits = await Promise.allSettled(
				stages.map((stage) => internalNginx.commitStagedConfig(stage, { preserveBackup: true })),
			);
			const statuses = commits.map((result) => {
				if (result.status === "rejected") throw result.reason;
				return result.value;
			});
			// Cleanup cannot invalidate a successfully validated group. Keep failed
			// backup removals for later cleanup rather than attempting an unsafe rollback.
			const cleanups = await Promise.allSettled(
				stages.map(({ host_type, host }) => internalNginx.deleteBackupConfig(host_type, host)),
			);
			for (const cleanup of cleanups) {
				if (cleanup.status === "rejected")
					logger.error(`Nginx backup cleanup failed: ${cleanup.reason.message}`);
			}
			Promise.resolve()
				.then(() => internalAnubis.generatePolicy())
				.catch((err) => logger.error(`Anubis policy generation failed: ${err.message}`));
			return statuses;
		} catch (err) {
			logger.error(`Nginx batch test failed: ${err.message}`);
			const rollbacks = await Promise.allSettled(
				stages.map((stage) => internalNginx.rollbackStagedConfig(stage, err)),
			);
			// Do not release the shared lock while another rollback can still write files.
			const failedRollback = rollbacks.find((result) => result.status === "rejected");
			if (options.reload) await internalNginx.reload();
			if (failedRollback) throw failedRollback.reason;
			if (options.throwOnError) throw err;
			return rollbacks.map((result) => {
				if (result.status === "rejected") throw result.reason;
				return result.value;
			});
		}
	},

	/**
	 * @param   {string}  cfg
	 * @returns {boolean}
	 */
	advancedConfigHasDefaultLocation: (cfg) => {
		// Inspect only top-level prefix locations. Quoted arguments and comments
		// must not hide the generated proxy; exact/regex locations may coexist with it.
		const lexer = new ConfigurationLexer();
		for (const { words, boundary } of lexer.feed(cfg)) {
			if (boundary !== "{") continue;
			if (
				words[0] === "location" &&
				((words.length === 2 && words[1] === "/") ||
					(words.length === 3 && words[1] === "^~" && words[2] === "/"))
			) {
				return true;
			}
			// Nested locations do not replace the server's root location. Lua blocks
			// need their own comment/string handling while skipping their contents.
			lexer.skipBlock(/_by_lua_block$/.test(words[0] || ""));
		}
		return false;
	},

	/**
	 * Read nginx log file contents.
	 * @param   {import("../lib/types.js").Access}  access
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
