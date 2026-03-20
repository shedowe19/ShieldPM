import fs from "node:fs";
import path from "node:path";
import { decrypt, encrypt } from "../../lib/encryption.js";
import { global as logger } from "../../logger.js";

const WEBSITES_DIR = "/data/websites";
const pollingTimers = new Map();

const getWebsiteDir = (hostId) => {
	const dir = path.join(WEBSITES_DIR, `host-${hostId}`);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}
	return dir;
};

const getAuth = (encryptedCredentials) => {
	if (!encryptedCredentials) return {};
	try {
		const credentials = decrypt(encryptedCredentials);
		return { onAuth: () => ({ username: "git", password: credentials }) };
	} catch (err) {
		logger.error("Failed to decrypt Git credentials:", err);
		return {};
	}
};

const intervalToMs = (interval, unit) => {
	switch (unit) {
		case "s":
			return interval * 1000;
		case "m":
			return interval * 60 * 1000;
		case "h":
			return interval * 60 * 60 * 1000;
		default:
			return interval * 60 * 1000;
	}
};

export { WEBSITES_DIR, encrypt, getAuth, getWebsiteDir, intervalToMs, pollingTimers };
