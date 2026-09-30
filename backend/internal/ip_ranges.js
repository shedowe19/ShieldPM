import { randomUUID } from "node:crypto";
import fs from "node:fs";
import https from "node:https";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ipaddr from "ipaddr.js";
import { ProxyAgent } from "proxy-agent";
import errs from "../lib/error.js";
import utils from "../lib/utils.js";
import { ipRanges as logger } from "../logger.js";
import internalNginx from "./nginx.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLOUDFARE_V4_URL = "https://www.cloudflare.com/ips-v4";
const CLOUDFARE_V6_URL = "https://www.cloudflare.com/ips-v6";
let fetchPromise = null;

const parseRanges = (content, kind) => {
	const ranges = content
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	if (
		!ranges.length ||
		ranges.some((range) => !ipaddr.isValidCIDR(range) || ipaddr.parseCIDR(range)[0].kind() !== kind)
	) {
		throw new errs.ConfigurationError(`Invalid or empty ${kind} IP range response`);
	}
	return ranges;
};

const internalIpRanges = {
	interval_timeout: 1000 * 60 * 60 * 6,
	interval: null,
	interval_processing: false,
	iteration_count: 0,
	enabled: false,
	generation: 0,

	initTimer: () => {
		if (!internalIpRanges.enabled || internalIpRanges.interval) return;
		const generation = internalIpRanges.generation;
		logger.info("IP Ranges Renewal Timer initialized");
		internalIpRanges.interval = setInterval(() => {
			if (internalIpRanges.enabled && generation === internalIpRanges.generation) {
				internalIpRanges.fetch().catch((err) => logger.warn(err.message));
			}
		}, internalIpRanges.interval_timeout);
		internalIpRanges.interval.unref?.();
	},

	/** Stop automatic refresh and invalidate requests without deleting the last known trust list. */
	stop: () => {
		if (internalIpRanges.interval) clearInterval(internalIpRanges.interval);
		internalIpRanges.interval = null;
		internalIpRanges.enabled = false;
		internalIpRanges.generation++;
	},

	/**
	 * Apply a validated database policy; only enabling triggers an immediate fetch.
	 * @param {{enabled: boolean, refresh_interval_hours: number}} policy
	 * @param {{startup?: boolean}} [options]
	 * @returns {Promise<void>}
	 */
	configure: async (policy, { startup = false } = {}) => {
		const wasEnabled = internalIpRanges.enabled;
		const timeout = policy.refresh_interval_hours * 60 * 60 * 1000;
		if (!policy.enabled) {
			internalIpRanges.stop();
			internalIpRanges.interval_timeout = timeout;
			// A publication already holding the lock must finish before disabling returns.
			await internalNginx.withConfigurationLock(async () => {});
			return;
		}
		if (internalIpRanges.interval_timeout !== timeout && internalIpRanges.interval) {
			clearInterval(internalIpRanges.interval);
			internalIpRanges.interval = null;
		}
		internalIpRanges.interval_timeout = timeout;
		internalIpRanges.enabled = true;
		if (!wasEnabled) internalIpRanges.generation++;
		internalIpRanges.initTimer();
		if (wasEnabled) return;
		const generation = internalIpRanges.generation;
		const refresh = () => {
			if (!internalIpRanges.enabled || internalIpRanges.generation !== generation) return;
			return internalIpRanges.fetch({ reload: !startup });
		};
		// Re-enabling while an obsolete request is still running starts a fresh request when it finishes.
		const initialFetch = fetchPromise ? fetchPromise.then(refresh) : refresh();
		if (startup) await initialFetch;
		else initialFetch?.catch((err) => logger.warn(err.message));
	},

	fetchUrl: (url) => {
		const agent = new ProxyAgent();
		return new Promise((resolve, reject) => {
			logger.info(`Fetching ${url}`);
			return https
				.get(url, { agent, timeout: 30000 }, (res) => {
					if (res.statusCode !== 200) {
						res.resume();
						reject(new errs.ConfigurationError(`IP range request returned HTTP ${res.statusCode}`));
						return;
					}
					res.on("error", reject);
					res.setEncoding("utf8");
					let raw_data = "";
					res.on("data", (chunk) => {
						raw_data += chunk;
					});

					res.on("end", () => {
						resolve(raw_data);
					});
				})
				.on("timeout", function () {
					this.destroy(new errs.ConfigurationError("IP range request timed out"));
				})
				.on("error", (err) => {
					reject(err);
				});
		});
	},

	/**
	 * Fetch and apply ranges manually or automatically; startup performs its own final reload.
	 * @param {{reload?: boolean}} [options]
	 * @returns {Promise<void>}
	 */
	fetch: ({ reload = true } = {}) => {
		if (fetchPromise) return fetchPromise;
		const generation = internalIpRanges.generation;
		const isCurrent = () => generation === internalIpRanges.generation;
		internalIpRanges.interval_processing = true;
		logger.info("Fetching IP Ranges from online services...");
		fetchPromise = (async () => {
			try {
				const ipv4 = await internalIpRanges.fetchUrl(CLOUDFARE_V4_URL);
				if (!isCurrent()) return;
				const ipv6 = await internalIpRanges.fetchUrl(CLOUDFARE_V6_URL);
				if (!isCurrent()) return;
				const ipRanges = [...parseRanges(ipv4, "ipv4"), ...parseRanges(ipv6, "ipv6")];
				await internalNginx.withConfigurationLock(async () => {
					if (!isCurrent()) return;
					const applied = await internalIpRanges.generateConfig(ipRanges, isCurrent);
					if (!applied || !isCurrent()) return;
					if (reload) await internalNginx.reload();
					internalIpRanges.iteration_count++;
				});
			} catch (err) {
				logger.fatal(err.message);
			}
		})().finally(() => {
			internalIpRanges.interval_processing = false;
			fetchPromise = null;
		});
		return fetchPromise;
	},

	/**
	 * @param   {Array}  ip_ranges
	 * @param   {() => boolean} [isCurrent]
	 * @returns {Promise}
	 */
	generateConfig: async (ip_ranges, isCurrent = () => true) => {
		const renderEngine = utils.getRenderEngine();
		const filename = "/data/nginx/ip_ranges.conf";
		const temporaryFile = `${filename}.${randomUUID()}.tmp`;

		let template = null;
		try {
			template = await fs.promises.readFile(`${__dirname}/../templates/ip_ranges.conf`, { encoding: "utf8" });
		} catch (err) {
			throw new errs.ConfigurationError(err.message);
		}

		try {
			const config_text = await renderEngine.parseAndRender(template, { ip_ranges: ip_ranges });
			if (!isCurrent()) return false;
			await fs.promises.writeFile(temporaryFile, config_text, { encoding: "utf8" });
			if (!isCurrent()) return false;
			await fs.promises.rename(temporaryFile, filename);
			return true;
		} catch (err) {
			logger.warn(`Could not write ${filename}: ${err.message}`);
			throw new errs.ConfigurationError(err.message);
		} finally {
			await fs.promises.rm(temporaryFile, { force: true });
		}
	},
};

export default internalIpRanges;
