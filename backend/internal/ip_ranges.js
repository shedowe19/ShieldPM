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
const requestedMultiplier = Number(process.env.IPRT);
const renewalMultiplier =
	Number.isInteger(requestedMultiplier) && requestedMultiplier >= 1 && requestedMultiplier <= 99
		? requestedMultiplier
		: 1;

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
	interval_timeout: 1000 * 60 * 60 * 6 * renewalMultiplier,
	interval: null,
	interval_processing: false,
	iteration_count: 0,

	initTimer: () => {
		if (internalIpRanges.interval) return;
		logger.info("IP Ranges Renewal Timer initialized");
		internalIpRanges.interval = setInterval(internalIpRanges.fetch, internalIpRanges.interval_timeout);
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
	 * Triggered at startup and then later by a timer, this will fetch the ip ranges from services and apply them to nginx.
	 */
	fetch: async () => {
		if (!internalIpRanges.interval_processing) {
			internalIpRanges.interval_processing = true;
			logger.info("Fetching IP Ranges from online services...");

			let ip_ranges = [];

			try {
				const cloudflare_v4_data = await internalIpRanges.fetchUrl(CLOUDFARE_V4_URL);
				const items_v4 = parseRanges(cloudflare_v4_data, "ipv4");
				ip_ranges = [...ip_ranges, ...items_v4];

				const cloudflare_v6_data = await internalIpRanges.fetchUrl(CLOUDFARE_V6_URL);
				const items_v6 = parseRanges(cloudflare_v6_data, "ipv6");
				ip_ranges = [...ip_ranges, ...items_v6];

				const clean_ip_ranges = ip_ranges.filter((range) => !!range);

				await internalNginx.withConfigurationLock(async () => {
					await internalIpRanges.generateConfig(clean_ip_ranges);
					if (internalIpRanges.iteration_count) await internalNginx.reload();
				});

				internalIpRanges.iteration_count++;
			} catch (err) {
				logger.fatal(err.message);
			} finally {
				internalIpRanges.interval_processing = false;
			}
		}
	},

	/**
	 * @param   {Array}  ip_ranges
	 * @returns {Promise}
	 */
	generateConfig: async (ip_ranges) => {
		const renderEngine = utils.getRenderEngine();
		const filename = "/data/nginx/ip_ranges.conf";

		let template = null;
		try {
			template = await fs.promises.readFile(`${__dirname}/../templates/ip_ranges.conf`, { encoding: "utf8" });
		} catch (err) {
			throw new errs.ConfigurationError(err.message);
		}

		try {
			const config_text = await renderEngine.parseAndRender(template, { ip_ranges: ip_ranges });
			await fs.promises.writeFile(filename, config_text, { encoding: "utf8" });
			return true;
		} catch (err) {
			logger.warn(`Could not write ${filename}: ${err.message}`);
			throw new errs.ConfigurationError(err.message);
		}
	},
};

export default internalIpRanges;
