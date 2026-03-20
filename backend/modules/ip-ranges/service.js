import fs from "node:fs";
import https from "node:https";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ProxyAgent } from "proxy-agent";
import errs from "../../lib/error.js";
import utils from "../../lib/utils.js";
import { ipRanges as logger } from "../../logger.js";
import internalNginx from "../../internal/nginx.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const CLOUDFLARE_V4_URL = "https://www.cloudflare.com/ips-v4";
const CLOUDFLARE_V6_URL = "https://www.cloudflare.com/ips-v6";

const regIpV4 = /^(\d+\.?){4}\/\d+/;
const regIpV6 = /^(([\\da-fA-F]+)?:)+\/\\d+/;

const ipRangesService = {
	interval_timeout: 1000 * 60 * 60 * 6 * Number.parseInt(process.env.IPRT, 10),
	interval: null,
	interval_processing: false,
	iteration_count: 0,

	initTimer: () => {
		logger.info("IP Ranges Renewal Timer initialized");
		ipRangesService.interval = setInterval(ipRangesService.fetch, ipRangesService.interval_timeout);
	},

	fetchUrl: (url) => {
		const agent = new ProxyAgent();
		return new Promise((resolve, reject) => {
			logger.info(`Fetching ${url}`);
			return https
				.get(url, { agent }, (res) => {
					res.setEncoding("utf8");
					let raw_data = "";
					res.on("data", (chunk) => { raw_data += chunk; });
					res.on("end", () => { resolve(raw_data); });
				})
				.on("error", (err) => { reject(err); });
		});
	},

	fetch: async () => {
		if (!ipRangesService.interval_processing) {
			ipRangesService.interval_processing = true;
			logger.info("Fetching IP Ranges from online services...");

			let ip_ranges = [];
			try {
				const v4 = await ipRangesService.fetchUrl(CLOUDFLARE_V4_URL);
				ip_ranges = [...ip_ranges, ...v4.split("\n").filter((l) => regIpV4.test(l))];

				const v6 = await ipRangesService.fetchUrl(CLOUDFLARE_V6_URL);
				ip_ranges = [...ip_ranges, ...v6.split("\n").filter((l) => regIpV6.test(l))];

				await ipRangesService.generateConfig(ip_ranges.filter(Boolean));

				if (ipRangesService.iteration_count) {
					await internalNginx.reload();
				}
				ipRangesService.iteration_count++;
			} catch (err) {
				logger.fatal(err.message);
			} finally {
				ipRangesService.interval_processing = false;
			}
		}
	},

	generateConfig: async (ip_ranges) => {
		const renderEngine = utils.getRenderEngine();
		const filename = "/data/nginx/ip_ranges.conf";
		let template;
		try {
			template = await fs.promises.readFile(`${__dirname}/../../templates/ip_ranges.conf`, { encoding: "utf8" });
		} catch (err) {
			throw new errs.ConfigurationError(err.message);
		}
		try {
			const config_text = await renderEngine.parseAndRender(template, { ip_ranges });
			await fs.promises.writeFile(filename, config_text, { encoding: "utf8" });
			return true;
		} catch (err) {
			logger.warn(`Could not write ${filename}: ${err.message}`);
			throw new errs.ConfigurationError(err.message);
		}
	},
};

export default ipRangesService;
