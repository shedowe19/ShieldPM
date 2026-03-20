import { spawn } from "node:child_process";
import fs from "node:fs";
import { global as logger } from "../../logger.js";
import AccessList from "../../models/access_list.js";
import ProxyHost from "../../models/proxy_host.js";
import { dataPath, deleteProcess, getProcess, hasProcess, setProcess } from "./state.js";

const generateConfig = (list) => {
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

ssl_insecure_skip_verify = true
${meta.oauth2_scope ? `scope = "${meta.oauth2_scope}"` : ""}
${meta.oauth2_insecure_oidc_allow_unverified_email ? "insecure_oidc_allow_unverified_email = true" : ""}

set_xauthrequest = true
pass_access_token = true
pass_authorization_header = true
upstreams = [ "static://200" ]
whitelist_domains = ["*"]

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
		const emailsFile = `${dataPath}/access/oauth2/${id}/allowed_emails`;
		config += `
authenticated_emails_file = "${emailsFile}"
`;
	}
	if (meta.oauth2_allowed_groups) {
		const groups = meta.oauth2_allowed_groups.split(",").map((g) => g.trim());
		config += `
allowed_groups = [
${groups.map((g) => `  "${g}"`).join(",\n")}
]
`;
	}
	return config;
};

const stop = async (id) => {
	const child = getProcess(id);
	if (child) {
		logger.info(`Stopping OAuth2 Proxy #${id}...`);
		child.kill("SIGTERM");
		deleteProcess(id);
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
};

const start = async (list, retryCount = 0) => {
	const MAX_RETRIES = 3;
	const RETRY_DELAY_MS = 3000;
	if (hasProcess(list.id)) await stop(list.id);
	const accessDir = `${dataPath}/access/oauth2/${list.id}`;
	await fs.promises.mkdir(accessDir, { recursive: true });
	if (list.meta.oauth2_allowed_emails) {
		const emailsFile = `${accessDir}/allowed_emails`;
		const emailsContent = list.meta.oauth2_allowed_emails
			.split(",")
			.map((e) => e.trim())
			.join("\n");
		await fs.promises.writeFile(emailsFile, emailsContent);
	}
	const configContent = generateConfig(list);
	const configFile = `${accessDir}/oauth2-proxy.cfg`;
	await fs.promises.writeFile(configFile, configContent);
	try {
		await fs.promises.mkdir("/run/shieldpm", { recursive: true });
		const child = spawn("oauth2-proxy", [`--config=${configFile}`], {
			stdio: ["ignore", "pipe", "pipe"],
			detached: true,
		});
		child.unref();
		setProcess(list.id, child);
		child.stdout.on("data", (data) => {
			logger.debug(`[OAuth2Proxy #${list.id}] ${data.toString().trim()}`);
		});
		child.stderr.on("data", (data) => {
			logger.info(`[OAuth2Proxy #${list.id}] ${data.toString().trim()}`);
		});
		child.on("exit", (code, signal) => {
			deleteProcess(list.id);
			if (code !== 0 && signal === null && retryCount < MAX_RETRIES) {
				const nextRetry = retryCount + 1;
				const delay = RETRY_DELAY_MS * nextRetry;
				logger.warn(
					`OAuth2 Proxy #${list.id} exited with code ${code}, retrying in ${delay / 1000}s (attempt ${nextRetry}/${MAX_RETRIES})...`,
				);
				setTimeout(() => {
					start(list, nextRetry).catch((err) =>
						logger.error(`OAuth2 Proxy #${list.id} retry ${nextRetry} failed:`, err),
					);
				}, delay);
			} else if (code !== 0) {
				logger.error(
					`OAuth2 Proxy #${list.id} exited with code ${code} / signal ${signal} after ${retryCount} retries. Giving up.`,
				);
			} else {
				logger.info(`OAuth2 Proxy #${list.id} stopped (code ${code}, signal ${signal}).`);
			}
		});
		child.on("error", (err) => {
			logger.error(`Failed to spawn OAuth2 Proxy #${list.id}:`, err);
		});
	} catch (err) {
		logger.error(`Error starting OAuth2 Proxy #${list.id}:`, err);
	}
};

const restart = async (list) => {
	await start(list);
};

const init = async () => {
	logger.info("Initializing OAuth2 Proxies...");
	try {
		const { execSync } = await import("node:child_process");
		execSync("pkill -TERM -f oauth2-proxy", { stdio: "ignore" });
	} catch {}
	const lists = await AccessList.query().where("is_deleted", 0);
	for (const list of lists) {
		if (list.meta && (list.meta.auth_type === "oauth2_proxy" || list.meta.authType === "oauth2_proxy")) {
			const assignedHosts = await ProxyHost.query().where("access_list_id", list.id).where("is_deleted", 0);
			if (assignedHosts.length > 0) {
				logger.info(
					`OAuth2 Proxy #${list.id} is assigned to ${assignedHosts.length} proxy host(s), starting...`,
				);
				await start(list);
			} else {
				logger.info(`OAuth2 Proxy #${list.id} is not assigned to any proxy host, skipping.`);
			}
		}
	}
};

export default { init, generateConfig, start, stop, restart };
