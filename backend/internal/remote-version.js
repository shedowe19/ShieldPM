import https from "node:https";
import { ProxyAgent } from "proxy-agent";
import errs from "../lib/error.js";
import { remoteVersion as logger } from "../logger.js";
import pjson from "../package.json" with { type: "json" };

const VERSION_URL = "https://api.github.com/repos/shedowe19/ShieldPM/releases/latest";
const VERSION_PATTERN =
	/^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/**
 * Compare two semver version strings.
 * @param {string} a
 * @param {string} b
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
const compareVersions = (a, b) => {
	const partsA = typeof a === "string" && a.match(VERSION_PATTERN);
	const partsB = typeof b === "string" && b.match(VERSION_PATTERN);
	if (!partsA || !partsB) throw new errs.ValidationError("Invalid release version");
	for (let i = 1; i <= 3; i++) {
		const nA = BigInt(partsA[i]);
		const nB = BigInt(partsB[i]);
		if (nA < nB) return -1;
		if (nA > nB) return 1;
	}
	if (!partsA[4] || !partsB[4]) return partsA[4] ? -1 : partsB[4] ? 1 : 0;
	const prereleaseA = partsA[4].split(".");
	const prereleaseB = partsB[4].split(".");
	for (let i = 0; i < Math.max(prereleaseA.length, prereleaseB.length); i++) {
		const left = prereleaseA[i];
		const right = prereleaseB[i];
		if (left === right) continue;
		if (left === undefined) return -1;
		if (right === undefined) return 1;
		const numericLeft = /^\d+$/.test(left);
		const numericRight = /^\d+$/.test(right);
		if (numericLeft && numericRight) return BigInt(left) < BigInt(right) ? -1 : 1;
		if (numericLeft !== numericRight) return numericLeft ? -1 : 1;
		return left < right ? -1 : 1;
	}
	return 0;
};

const internalRemoteVersion = {
	cache_timeout: 1000 * 60 * 60 * 24, // 1 day
	last_result: null,
	last_fetch_time: null,
	in_flight: null,

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
			if (!internalRemoteVersion.in_flight) {
				internalRemoteVersion.in_flight = (async () => {
					const raw = await internalRemoteVersion.fetchUrl(VERSION_URL);
					const data = JSON.parse(raw);
					compareVersions(pjson.version, data?.tag_name);
					internalRemoteVersion.last_result = { tag_name: data.tag_name };
					internalRemoteVersion.last_fetch_time = Date.now();
				})();
			}
			const pending = internalRemoteVersion.in_flight;
			try {
				await pending;
			} finally {
				if (internalRemoteVersion.in_flight === pending) internalRemoteVersion.in_flight = null;
			}
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
				res.on("error", reject);
				if (res.statusCode !== 200) {
					res.resume();
					reject(new errs.InternalError(`Release lookup failed (HTTP ${res.statusCode})`));
					return;
				}
				res.setEncoding("utf8");
				let raw_data = "";
				let bytes = 0;
				res.on("data", (chunk) => {
					bytes += Buffer.byteLength(chunk);
					if (bytes > 1024 * 1024) {
						req.destroy(new errs.InternalError("Release response exceeds size limit"));
						return;
					}
					raw_data += chunk;
				});
				res.on("end", () => {
					resolve(raw_data);
				});
				res.on("aborted", () => reject(new errs.InternalError("Release response was interrupted")));
			});
			const timer = setTimeout(() => req.destroy(new errs.InternalError("Release lookup timed out")), 10000);
			req.once("close", () => {
				clearTimeout(timer);
				agent.destroy();
			});
			req.on("error", (err) => {
				reject(err);
			});
		});
	},
};

export default internalRemoteVersion;
