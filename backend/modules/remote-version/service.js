import https from "node:https";
import { ProxyAgent } from "proxy-agent";
import { remoteVersion as logger } from "../../logger.js";
import pjson from "../../package.json" with { type: "json" };

const VERSION_URL = "https://api.github.com/repos/shedowe19/ShieldPM/releases/latest";

const remoteVersionService = {
	cache_timeout: 1000 * 60 * 60 * 24,
	last_result: null,
	last_fetch_time: null,

	get: async () => {
		if (
			!remoteVersionService.last_result ||
			!remoteVersionService.last_fetch_time ||
			Date.now() - remoteVersionService.last_fetch_time > remoteVersionService.cache_timeout
		) {
			const raw = await remoteVersionService.fetchUrl(VERSION_URL);
			const data = await new Promise((resolve, reject) => {
				setImmediate(() => {
					try {
						resolve(JSON.parse(raw));
					} catch (e) {
						reject(e);
					}
				});
			});
			remoteVersionService.last_result = data;
			remoteVersionService.last_fetch_time = Date.now();
		}

		const latestVersion = remoteVersionService.last_result.tag_name;
		const currentVersion = pjson.version;
		return {
			current: currentVersion,
			latest: latestVersion,
			update_available: !currentVersion.startsWith(latestVersion) && currentVersion.length >= 13,
		};
	},

	fetchUrl: (url) => {
		const agent = new ProxyAgent();
		const headers = { "User-Agent": `ShieldPM/${pjson.version}` };
		return new Promise((resolve, reject) => {
			logger.info(`Fetching ${url}`);
			const req = https.get(url, { agent, headers }, (res) => {
				res.setEncoding("utf8");
				let raw_data = "";
				res.on("data", (chunk) => {
					raw_data += chunk;
				});
				res.on("end", () => {
					resolve(raw_data);
				});
			});
			req.on("error", (err) => {
				reject(err);
			});
		});
	},
};

export default remoteVersionService;
