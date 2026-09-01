import { spawn } from "node:child_process";
import fs from "node:fs";
import { global as logger } from "../logger.js";
import AccessList from "../models/access_list.js";
import ProxyHost from "../models/proxy_host.js";

const processes = new Map();
const retryTimers = new Map();
const CHILD_STOP_TIMEOUT_MS = 5_000;
const dataPath = process.env.DATA_PATH || "/data";

let shuttingDown = false;

const withTimeout = (promise, milliseconds, message) =>
	new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error(message)), milliseconds);
		timer.unref?.();
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			},
		);
	});

const internalOAuth2Proxy = {
	/**
	 * Initialize all proxies on startup
	 */
	init: async () => {
		shuttingDown = false;
		logger.info("Initializing OAuth2 Proxies...");

		// Clean up any zombie proxies from previous runs before we initialize new ones
		try {
			logger.info("Cleaning up old OAuth2 Proxy instances...");
			const { execSync } = await import("node:child_process");
			execSync("pkill -TERM -f oauth2-proxy", { stdio: "ignore" });
		} catch (_e) {
			// pkill returns 1 if no process found, ignore
		}

		// Find all Access Lists that use oauth2_proxy
		const lists = await AccessList.query().where("is_deleted", 0);

		for (const list of lists) {
			if (list.meta && (list.meta.auth_type === "oauth2_proxy" || list.meta.authType === "oauth2_proxy")) {
				// Only start if this access list is actually assigned to at least one active proxy host
				const assignedHosts = await ProxyHost.query().where("access_list_id", list.id).where("is_deleted", 0);

				if (assignedHosts.length > 0) {
					logger.info(
						`OAuth2 Proxy #${list.id} is assigned to ${assignedHosts.length} proxy host(s), starting...`,
					);
					await internalOAuth2Proxy.start(list);
				} else {
					logger.info(`OAuth2 Proxy #${list.id} is not assigned to any proxy host, skipping.`);
				}
			}
		}
	},

	/**
	 * Generate configuration content for OAuth2 Proxy
	 * @param {AccessList} list
	 * @returns {string}
	 */
	generateConfig: (list) => {
		const meta = list.meta;
		const id = list.id;
		const prefix = meta.oauth2_proxy_prefix || "/oauth2/";

		let config = `
## ShieldPM Generated Config for Access List #${id}
## Do not edit manually

http_address = "unix:///run/shieldpm/oauth2-proxy-${id}.sock"
reverse_proxy = true
proxy_prefix = "${prefix}"

provider = "${meta.oauth2_provider || "google"}"
client_id = "${meta.oauth2_client_id}"
client_secret = "${meta.oauth2_client_secret}"
cookie_secret = "${meta.oauth2_cookie_secret}"

cookie_secure = true
cookie_httponly = true
cookie_refresh = "1h"

# Provider Settings
${meta.oauth2_insecure_ssl ? "ssl_insecure_skip_verify = true" : ""}
${meta.oauth2_scope ? `scope = "${meta.oauth2_scope}"` : ""}
${meta.oauth2_insecure_oidc_allow_unverified_email ? "insecure_oidc_allow_unverified_email = true" : ""}

# Headers for Nginx
set_xauthrequest = true
pass_access_token = true
pass_authorization_header = true

# Generic Upstream (Nginx intercepts this anyway, but required by oauth2-proxy)
# We point it to a dummy location or localhost, Nginx uses auth_request so this isn't strictly used for traffic
# But oauth2-proxy needs an upstream defined.
upstreams = [ "static://200" ]

# Restrict redirect domains to configured allowed domains
# If no domains configured, only allow redirects to same origin
	${(() => {
		const allowed = meta.oauth2_allowed_email_domains || "";
		if (!allowed) return `whitelist_domains = ["$host"]`;
		const domains = allowed.split(",").filter((d) => d.trim());
		if (!domains.length) return `whitelist_domains = ["$host"]`;
		return domains.map((d) => `whitelist_domains = ["${d.trim()}"]`).join("\n");
	})()}

email_domains = [
${(meta.oauth2_allowed_email_domains || "*")
	.split(",")
	.map((d) => `  "${d.trim()}"`)
	.join(",\n")}
]
`;

		if (meta.oauth2_provider === "oidc") {
			config += `
oidc_issuer_url = "${meta.oauth2_oidc_issuer_url}"
`;
		}

		if (meta.oauth2_allowed_emails) {
			// The emails file is written in start() — here we only reference it in the config
			const emailsFile = `${dataPath}/access/oauth2/${id}/allowed_emails`;
			config += `
authenticated_emails_file = "${emailsFile}"
`;
		}

		// Allowed Groups is provider specific, but usually passed via --allowed-group
		if (meta.oauth2_allowed_groups) {
			const groups = meta.oauth2_allowed_groups.split(",").map((g) => g.trim());
			// allowed_groups = ["group1", "group2"]
			// TOML array format
			config += `
allowed_groups = [
${groups.map((g) => `  "${g}"`).join(",\n")}
]
`;
		}

		return config;
	},

	/**
	 * Start or Restart an OAuth2 Proxy process for an Access List
	 * @param {AccessList} list
	 * @param {number} [retryCount=0] - Internal retry counter
	 */
	start: async (list, retryCount = 0) => {
		if (shuttingDown) return;
		const MAX_RETRIES = 3;
		const RETRY_DELAY_MS = 3000; // 3 seconds between retries

		if (processes.has(list.id)) {
			await internalOAuth2Proxy.stop(list.id);
		}

		// Ensure directory exists
		const accessDir = `${dataPath}/access/oauth2/${list.id}`;
		await fs.promises.mkdir(accessDir, { recursive: true });

		// Write Allowed Emails File if needed
		if (list.meta.oauth2_allowed_emails) {
			const emailsFile = `${accessDir}/allowed_emails`;
			const emailsContent = list.meta.oauth2_allowed_emails
				.split(",")
				.map((e) => e.trim())
				.join("\n");
			await fs.promises.writeFile(emailsFile, emailsContent);
		}

		// Generate and Write Config
		const configContent = internalOAuth2Proxy.generateConfig(list);
		const configFile = `${accessDir}/oauth2-proxy.cfg`;
		await fs.promises.writeFile(configFile, configContent);

		try {
			// Ensure socket directory exists before spawning
			await fs.promises.mkdir("/run/shieldpm", { recursive: true });

			const child = spawn("oauth2-proxy", [`--config=${configFile}`], {
				stdio: ["ignore", "pipe", "pipe"],
				detached: false,
			}); // allow node to exit without waiting for this child

			let settleExit;
			const exitSettled = new Promise((resolve) => {
				settleExit = resolve;
			});
			processes.set(list.id, { child, exitSettled });

			child.stdout.on("data", (data) => {
				logger.debug(`[OAuth2Proxy #${list.id}] ${data.toString().trim()}`);
			});

			child.stderr.on("data", (data) => {
				// OAuth2 Proxy logs to stderr
				const msg = data.toString().trim();
				// Filter noisy logs if needed
				logger.info(`[OAuth2Proxy #${list.id}] ${msg}`);
			});

			child.once("close", (code, signal) => {
				if (processes.get(list.id)?.child === child) processes.delete(list.id);

				// Retry on failure (e.g. OIDC Discovery 404 during boot because Nginx hasn't fully reloaded)
				if (!shuttingDown && code !== 0 && signal === null && retryCount < MAX_RETRIES) {
					const nextRetry = retryCount + 1;
					const delay = RETRY_DELAY_MS * nextRetry; // Linear backoff: 3s, 6s, 9s
					logger.warn(
						`OAuth2 Proxy #${list.id} exited with code ${code}, retrying in ${delay / 1000}s (attempt ${nextRetry}/${MAX_RETRIES})...`,
					);
					const retryTimer = setTimeout(() => {
						retryTimers.delete(list.id);
						internalOAuth2Proxy.start(list, nextRetry).catch((err) => {
							logger.error(`OAuth2 Proxy #${list.id} retry ${nextRetry} failed:`, err);
						});
					}, delay);
					retryTimers.set(list.id, retryTimer);
				} else if (code !== 0) {
					logger.error(
						`OAuth2 Proxy #${list.id} exited with code ${code} / signal ${signal} after ${retryCount} retries. Giving up.`,
					);
				} else {
					logger.info(`OAuth2 Proxy #${list.id} stopped (code ${code}, signal ${signal}).`);
				}
				settleExit();
			});

			child.on("error", (err) => {
				logger.error(`Failed to spawn OAuth2 Proxy #${list.id}:`, err);
			});
		} catch (err) {
			logger.error(`Error starting OAuth2 Proxy #${list.id}:`, err);
		}
	},

	/**
	 * Stop the process
	 * @param {number} id
	 */
	stop: async (id) => {
		const retryTimer = retryTimers.get(id);
		if (retryTimer) {
			clearTimeout(retryTimer);
			retryTimers.delete(id);
		}
		const processEntry = processes.get(id);
		if (processEntry) {
			logger.info(`Stopping OAuth2 Proxy #${id}...`);
			processEntry.child.kill("SIGTERM");
			try {
				await withTimeout(processEntry.exitSettled, CHILD_STOP_TIMEOUT_MS, `OAuth2 Proxy #${id} did not stop`);
			} catch (error) {
				processEntry.child.kill("SIGKILL");
				await withTimeout(
					processEntry.exitSettled,
					CHILD_STOP_TIMEOUT_MS,
					`OAuth2 Proxy #${id} did not exit after SIGKILL`,
				);
				logger.warn(error.message);
			}
		}
	},

	stopAll: async () => {
		shuttingDown = true;
		for (const retryTimer of retryTimers.values()) clearTimeout(retryTimer);
		retryTimers.clear();
		const results = await Promise.allSettled([...processes.keys()].map((id) => internalOAuth2Proxy.stop(id)));
		const failed = results.find((result) => result.status === "rejected");
		if (failed) throw failed.reason;
	},

	/**
	 * Restart
	 * @param {AccessList} list
	 */
	restart: async (list) => {
		await internalOAuth2Proxy.start(list);
	},
};

export default internalOAuth2Proxy;
