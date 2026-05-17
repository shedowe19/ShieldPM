import https from "node:https";
import { ProxyAgent } from "proxy-agent";
import { remoteVersion as logger } from "../logger.js";
import pjson from "../package.json" with { type: "json" };

const VERSION_URL = "https://api.github.com/repos/shedowe19/ShieldPM/releases/latest";

/**
 * Compare two semver version strings.
 * @param {string} a
 * @param {string} b
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
const compareVersions = (a, b) => {
	// Strip leading 'v' if present (GitHub tag_name is 'v1.2.3')
	const versionA = a.replace(/^v/, "");
	const versionB = b.replace(/^v/, "");
	const partsA = versionA.split(".").map(Number);
	const partsB = versionB.split(".").map(Number);
	for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
		const nA = partsA[i] ?? 0;
		const nB = partsB[i] ?? 0;
		if (nA < nB) return -1;
		if (nA > nB) return 1;
	}
	return 0;
};

const internalRemoteVersion = {
	cache_timeout: 1000 * 60 * 60 * 24, // 1 day
	last_result: null,
	last_fetch_time: null,

	/**
	 * Fetch the latest version info, using a cached result if within the cache timeout period.
	 * @return {Promise<{current: string, latest: string, update_available: boolean}>} Version info
	 */
	get: async () => {
		if (
			!internalRemoteVersion.last_result ||
			!internalRemoteVersion.last_fetch_time ||
			Date.now() - internalRemoteVersion.last_fetch_time > internalRemoteVersion.cache_timeout
		) {
			const raw = await internalRemoteVersion.fetchUrl(VERSION_URL);
			// Prevent Event Loop blocking on large JSON
			const data = await new Promise((resolve, reject) => {
				setImmediate(() => {
					try {
						resolve(JSON.parse(raw));
					} catch (e) {
						reject(e);
					}
				});
			});
			internalRemoteVersion.last_result = data;
			internalRemoteVersion.last_fetch_time = Date.now();
		}

		const latestVersion = internalRemoteVersion.last_result.tag_name;
		const currentVersion = pjson.version;
		return {
			current: currentVersion,
			latest: latestVersion,
			update_available: compareVersions(currentVersion, latestVersion) < 0,
		};
	},

	fetchUrl: (url) => {
		const agent = new ProxyAgent();
		const headers = {
			"User-Agent": `ShieldPM/${pjson.version}`,
		};

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

export default internalRemoteVersion;
