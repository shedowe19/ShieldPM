import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import errs from "../lib/error.js";
import { global as logger } from "../logger.js";
import AccessList from "../models/access_list.js";
import ProxyHost from "../models/proxy_host.js";

const processes = new Map();
const generations = new Map();
const retryTimers = new Map();
const startQueues = new Map();
const tomlString = (value) => JSON.stringify(String(value ?? "")).replace(/\u007f/g, "\\u007f");
const csvValues = (value) =>
	String(value || "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);
const tomlArray = (values) => `[${values.map(tomlString).join(", ")}]`;

const withStartLock = async (id, start) => {
	const pending = (startQueues.get(id) || Promise.resolve()).catch(() => {}).then(start);
	startQueues.set(id, pending);
	try {
		return await pending;
	} finally {
		if (startQueues.get(id) === pending) startQueues.delete(id);
	}
};

const stopProcess = async (id) => {
	clearTimeout(retryTimers.get(id));
	retryTimers.delete(id);
	const child = processes.get(id);
	if (!child) return;
	// Detach before signalling; its delayed exit must not remove a replacement.
	processes.delete(id);
	logger.info(`Stopping OAuth2 Proxy #${id}...`);
	await new Promise((resolve, reject) => {
		let killTimer;
		let exitTimer;
		const finish = () => {
			clearTimeout(killTimer);
			clearTimeout(exitTimer);
			child.removeListener("exit", finish);
			child.removeListener("error", finish);
			resolve();
		};
		child.once("exit", finish);
		child.once("error", finish);
		killTimer = setTimeout(() => {
			exitTimer = setTimeout(() => {
				child.removeListener("exit", finish);
				child.removeListener("error", finish);
				processes.set(id, child);
				reject(new errs.InternalError(`OAuth2 Proxy #${id} did not exit after SIGKILL`));
			}, 1000);
			if (child.kill("SIGKILL") === false) finish();
		}, 5000);
		if (child.kill("SIGTERM") === false) finish();
	});
};
const dataPath = process.env.DATA_PATH || "/data";

const internalOAuth2Proxy = {
	/**
	 * Initialize all proxies on startup
	 */
	init: async () => {
		logger.info("Initializing OAuth2 Proxies...");

		// Clean up any zombie proxies from previous runs before we initialize new ones
		try {
			logger.info("Cleaning up old OAuth2 Proxy instances...");
			const escapedPath = dataPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			execFileSync(
				"pkill",
				["-TERM", "-f", `^oauth2-proxy --config=${escapedPath}/access/oauth2/[0-9]+/oauth2-proxy[.]cfg$`],
				{ stdio: "ignore" },
			);
		} catch (_e) {
			// pkill returns 1 if no process found, ignore
		}

		// Find all Access Lists that use oauth2_proxy
		const lists = await AccessList.query().where("is_deleted", 0);

		for (const list of lists) {
			if (list.meta && (list.meta.auth_type === "oauth2_proxy" || list.meta.authType === "oauth2_proxy")) {
				// Only start if this access list is actually assigned to at least one active proxy host
				const assignedHosts = await ProxyHost.query()
					.where("access_list_id", list.id)
					.where("is_deleted", 0)
					.where("enabled", 1);

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
	 * @param {string[]} redirectDomains Domains of assigned, enabled proxy hosts
	 * @returns {string}
	 */
	generateConfig: (list, redirectDomains = []) => {
		const meta = list.meta || {};
		const id = list.id;
		const prefix = (meta.oauth2_proxy_prefix || "/oauth2/").replace(/\/?$/, "/");

		let config = `
## ShieldPM Generated Config for Access List #${id}
## Do not edit manually

http_address = "unix:///run/shieldpm/oauth2-proxy-${id}.sock"
reverse_proxy = true
proxy_prefix = ${tomlString(prefix)}

provider = ${tomlString(meta.oauth2_provider || "google")}
client_id = ${tomlString(meta.oauth2_client_id)}
client_secret = ${tomlString(meta.oauth2_client_secret)}
cookie_secret = ${tomlString(meta.oauth2_cookie_secret)}

cookie_secure = true
cookie_httponly = true
cookie_refresh = "1h"

# Provider Settings
${meta.oauth2_insecure_ssl ? "ssl_insecure_skip_verify = true" : ""}
${meta.oauth2_scope ? `scope = ${tomlString(meta.oauth2_scope)}` : ""}
${meta.oauth2_insecure_oidc_allow_unverified_email ? "insecure_oidc_allow_unverified_email = true" : ""}

# Headers for Nginx
set_xauthrequest = true
pass_access_token = true
pass_authorization_header = true

# Generic Upstream (Nginx intercepts this anyway, but required by oauth2-proxy)
# We point it to a dummy location or localhost, Nginx uses auth_request so this isn't strictly used for traffic
# But oauth2-proxy needs an upstream defined.
upstreams = [ "static://200" ]

# Only assigned proxy hosts may receive absolute post-login redirects.
# Email domains describe account policy and are not redirect destinations.
whitelist_domains = ${tomlArray([...new Set(redirectDomains)])}
email_domains = ${tomlArray(csvValues(meta.oauth2_allowed_email_domains || (meta.oauth2_allowed_emails ? "" : "*")))}

`;

		if (["oidc", "keycloak-oidc"].includes(meta.oauth2_provider)) {
			config += `
oidc_issuer_url = ${tomlString(meta.oauth2_oidc_issuer_url)}
`;
		}

		if (meta.oauth2_allowed_emails) {
			// The emails file is written in start() — here we only reference it in the config
			const emailsFile = `${dataPath}/access/oauth2/${id}/allowed_emails`;
			config += `
authenticated_emails_file = ${tomlString(emailsFile)}
`;
		}

		// Allowed Groups is provider specific, but usually passed via --allowed-group
		if (meta.oauth2_allowed_groups) {
			const groups = csvValues(meta.oauth2_allowed_groups);
			// allowed_groups = ["group1", "group2"]
			// TOML array format
			config += `
allowed_groups = ${tomlArray(groups)}
`;
		}

		return config;
	},

	/**
	 * Start or Restart an OAuth2 Proxy process for an Access List
	 * @param {AccessList} list
	 * @param {number} [retryCount=0] - Internal retry counter
	 * @param {symbol} [retryGeneration] Generation captured by a scheduled retry
	 */
	start: async (list, retryCount = 0, retryGeneration = null) => {
		const MAX_RETRIES = 3;
		const RETRY_DELAY_MS = 3000; // 3 seconds between retries

		const generation = retryGeneration || Symbol();
		if (retryGeneration && generations.get(list.id) !== generation) return;
		generations.set(list.id, generation);
		return withStartLock(list.id, async () => {
			if (generations.get(list.id) !== generation) return;
			await stopProcess(list.id);
			if (generations.get(list.id) !== generation) return;

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
				await fs.promises.writeFile(emailsFile, emailsContent, { mode: 0o600 });
				await fs.promises.chmod(emailsFile, 0o600);
			}

			// Generate and Write Config
			const assignedHosts = await ProxyHost.query()
				.where("access_list_id", list.id)
				.where("is_deleted", 0)
				.where("enabled", 1)
				.withGraphFetched("host_domains");
			const redirectDomains = assignedHosts.flatMap((host) =>
				(host.host_domains || []).map((domain) => domain.domain_name),
			);
			const configContent = internalOAuth2Proxy.generateConfig(list, redirectDomains);
			const configFile = `${accessDir}/oauth2-proxy.cfg`;
			await fs.promises.writeFile(configFile, configContent, { mode: 0o600 });
			await fs.promises.chmod(configFile, 0o600);

			try {
				// Ensure socket directory exists before spawning
				await fs.promises.mkdir("/run/shieldpm", { recursive: true });

				if (generations.get(list.id) !== generation) return;
				const child = spawn("oauth2-proxy", [`--config=${configFile}`], {
					stdio: ["ignore", "pipe", "pipe"],
					detached: false,
				}); // allow node to exit without waiting for this child

				processes.set(list.id, child);

				child.stdout.on("data", (data) => {
					logger.debug(`[OAuth2Proxy #${list.id}] ${data.toString().trim()}`);
				});

				child.stderr.on("data", (data) => {
					// OAuth2 Proxy logs to stderr
					const msg = data.toString().trim();
					// Filter noisy logs if needed
					logger.info(`[OAuth2Proxy #${list.id}] ${msg}`);
				});

				child.on("exit", (code, signal) => {
					if (processes.get(list.id) !== child || generations.get(list.id) !== generation) return;
					processes.delete(list.id);

					// Retry on failure (e.g. OIDC Discovery 404 during boot because Nginx hasn't fully reloaded)
					if (code !== 0 && signal === null && retryCount < MAX_RETRIES) {
						const nextRetry = retryCount + 1;
						const delay = RETRY_DELAY_MS * nextRetry; // Linear backoff: 3s, 6s, 9s
						logger.warn(
							`OAuth2 Proxy #${list.id} exited with code ${code}, retrying in ${delay / 1000}s (attempt ${nextRetry}/${MAX_RETRIES})...`,
						);
						const timer = setTimeout(() => {
							retryTimers.delete(list.id);
							if (generations.get(list.id) !== generation) return;
							internalOAuth2Proxy.start(list, nextRetry, generation).catch((err) => {
								logger.error(`OAuth2 Proxy #${list.id} retry ${nextRetry} failed:`, err);
							});
						}, delay);
						timer.unref?.();
						retryTimers.set(list.id, timer);
					} else if (code !== 0) {
						logger.error(
							`OAuth2 Proxy #${list.id} exited with code ${code} / signal ${signal} after ${retryCount} retries. Giving up.`,
						);
					} else {
						logger.info(`OAuth2 Proxy #${list.id} stopped (code ${code}, signal ${signal}).`);
					}
				});

				child.on("error", (err) => {
					if (processes.get(list.id) === child) processes.delete(list.id);
					logger.error(`Failed to spawn OAuth2 Proxy #${list.id}:`, err);
				});
			} catch (err) {
				logger.error(`Error starting OAuth2 Proxy #${list.id}:`, err);
			}
		});
	},

	/**
	 * Stop the process
	 * @param {number} id
	 */
	stop: async (id) => {
		generations.delete(id);
		// Serialize explicit stops too: a new start must wait for the old socket owner to exit.
		await withStartLock(id, () => stopProcess(id));
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
