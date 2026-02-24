import { spawn } from "node:child_process";
import fs from "node:fs";
import errs from "../lib/error.js";
import { global as logger } from "../logger.js";
import AccessList from "../models/access_list.js";

const processes = new Map();
const dataPath = process.env.DATA_PATH || "/data";

const internalOAuth2Proxy = {
	/**
	 * Initialize all proxies on startup
	 */
	init: async () => {
		logger.info("Initializing OAuth2 Proxies...");
		// Find all Access Lists that use oauth2_proxy
		const lists = await AccessList.query().where("is_deleted", 0);

		for (const list of lists) {
			if (list.meta && list.meta.auth_type === "oauth2_proxy") {
				await internalOAuth2Proxy.start(list);
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
${meta.oauth2_scope ? `scope = "${meta.oauth2_scope}"` : ""}
${meta.oauth2_insecure_oidc_allow_unverified_email ? "insecure_oidc_allow_unverified_email = true" : ""}

# Headers for Nginx
set_xauthrequest = true
pass_access_token = true
pass_authorization_header = true

# Generic Upstream (Nginx intercepts this anyway, but required by oauth2-proxy)
# We point it to a dummy location or localhost, Nginx uses auth_request so this isn't strictly used for traffic
# But oauth2-proxy needs an upstream defined.
upstream = "static://200"

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
			// Create authenticated emails file
			const emailsFile = `${dataPath}/access/${id}/allowed_emails`;
			const emailsContent = meta.oauth2_allowed_emails
				.split(",")
				.map((e) => e.trim())
				.join("\n");
			// We write this file synchronously here as it's part of config generation logic,
			// but better to do it in start() async.
			// For config string generation, we just reference it.
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
	 */
	start: async (list) => {
		if (processes.has(list.id)) {
			await internalOAuth2Proxy.stop(list.id);
		}

		// Ensure directory exists
		const accessDir = `${dataPath}/access/${list.id}`;
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

		// Ensure socket directory
		await fs.promises.mkdir("/run/shieldpm", { recursive: true });

		logger.info(`Starting OAuth2 Proxy for Access List #${list.id} (${list.name})...`);

		try {
			const child = spawn("oauth2-proxy", [`--config=${configFile}`], {
				stdio: ["ignore", "pipe", "pipe"],
				detached: false,
			});

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
				logger.warn(`OAuth2 Proxy #${list.id} exited with code ${code} / signal ${signal}`);
				processes.delete(list.id);

				// Optional: Restart policy?
				// For now, we don't loop restart to avoid death spirals,
				// but in a real init system we would.
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
		const child = processes.get(id);
		if (child) {
			logger.info(`Stopping OAuth2 Proxy #${id}...`);
			child.kill("SIGTERM");
			processes.delete(id);
			// Wait a bit
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
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
