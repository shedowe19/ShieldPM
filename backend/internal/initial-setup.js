import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import errs from "../lib/error.js";
import { setup as logger } from "../logger.js";
import InitialSetupClaim from "../models/initial-setup-claim.js";
import User from "../models/user.js";

const SETUP_CLAIM_ID = 1;
const GENERATED_TOKEN_FILE = "initial-admin-setup-token";
const MINIMUM_TOKEN_BYTES = 32;

const getGeneratedTokenPath = () => path.join(process.env.DATA_PATH || "/data", "shieldpm", GENERATED_TOKEN_FILE);

const validateTokenStrength = (value) => {
	const token = typeof value === "string" ? value.trim() : "";
	let bytes = 0;
	if (/^[a-f\d]{64,}$/i.test(token) && token.length % 2 === 0) {
		bytes = Buffer.from(token, "hex").length;
	} else if (/^[A-Za-z\d_-]{43,}$/.test(token)) {
		try {
			bytes = Buffer.from(token, "base64url").length;
		} catch {
			bytes = 0;
		}
	}
	if (bytes < MINIMUM_TOKEN_BYTES) {
		throw new errs.ConfigurationError("Initial admin setup token must contain at least 256 bits of randomness");
	}
	return token;
};

const readTokenFile = async (filePath) => {
	let handle;
	try {
		// Open and inspect the same descriptor. O_NOFOLLOW prevents a writable
		// parent directory from turning the lstat/read sequence into a symlink
		// swap that discloses or replaces the ownership credential.
		handle = await fs.promises.open(filePath, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
		const stats = await handle.stat();
		if (!stats.isFile()) {
			throw new errs.ConfigurationError("Initial admin setup token file must be a regular file");
		}
		if ((stats.mode & 0o077) !== 0) {
			throw new errs.ConfigurationError("Initial admin setup token file permissions must be 0600 or stricter");
		}
		const effectiveUid = typeof process.geteuid === "function" ? process.geteuid() : null;
		if (effectiveUid !== null && stats.uid !== effectiveUid && stats.uid !== 0) {
			throw new errs.ConfigurationError(
				"Initial admin setup token file must be owned by the service user or root",
			);
		}
		return validateTokenStrength(await handle.readFile("utf8"));
	} catch (error) {
		if (error?.code === "ELOOP") {
			throw new errs.ConfigurationError("Initial admin setup token file must not be a symbolic link");
		}
		throw error;
	} finally {
		await handle?.close();
	}
};

const createOrReadGeneratedToken = async () => {
	const tokenPath = getGeneratedTokenPath();
	await fs.promises.mkdir(path.dirname(tokenPath), { recursive: true, mode: 0o700 });
	try {
		const handle = await fs.promises.open(tokenPath, "wx", 0o600);
		try {
			await handle.writeFile(`${crypto.randomBytes(MINIMUM_TOKEN_BYTES).toString("base64url")}\n`, "utf8");
			await handle.sync();
		} finally {
			await handle.close();
		}
	} catch (error) {
		if (error?.code !== "EEXIST") {
			throw error;
		}
	}
	return readTokenFile(tokenPath);
};

const resolveOwnershipToken = async () => {
	const configuredFile = process.env.INITIAL_ADMIN_SETUP_TOKEN_FILE?.trim();
	if (configuredFile) {
		return { token: await readTokenFile(configuredFile), generated: false };
	}
	if (process.env.INITIAL_ADMIN_SETUP_TOKEN) {
		return { token: validateTokenStrength(process.env.INITIAL_ADMIN_SETUP_TOKEN), generated: false };
	}
	return { token: await createOrReadGeneratedToken(), generated: true };
};

const retireGeneratedToken = async () => {
	const tokenPath = getGeneratedTokenPath();
	try {
		const stats = await fs.promises.lstat(tokenPath);
		if (stats.isFile() && !stats.isSymbolicLink()) {
			await fs.promises.unlink(tokenPath);
		}
	} catch (error) {
		if (error?.code !== "ENOENT") {
			logger.warn(`Could not retire generated initial admin setup token file: ${error.message}`);
		}
	}
	delete process.env.INITIAL_ADMIN_SETUP_TOKEN;
};

const ensureInitialSetupOwnership = async () => {
	const activeUser = await User.query().select("id").where("is_deleted", 0).first();
	const existingClaim = await InitialSetupClaim.query().findById(SETUP_CLAIM_ID);

	if (activeUser) {
		if (existingClaim && !existingClaim.consumed_at) {
			await InitialSetupClaim.query().patchAndFetchById(SETUP_CLAIM_ID, {
				consumed_at: new Date().toISOString(),
				claimed_user_id: activeUser.id,
			});
		}
		await retireGeneratedToken();
		return;
	}

	const { token, generated } = await resolveOwnershipToken();
	const tokenHash = InitialSetupClaim.hashToken(token);
	if (!existingClaim) {
		await InitialSetupClaim.query().insert({ id: SETUP_CLAIM_ID, token_hash: tokenHash });
	} else if (existingClaim.consumed_at) {
		throw new errs.ConfigurationError("Initial admin setup ownership token has already been consumed");
	} else if (existingClaim.token_hash !== tokenHash) {
		throw new errs.ConfigurationError(
			"Configured initial admin setup token does not match the pending ownership claim",
		);
	}

	logger.warn(
		generated
			? `Initial admin setup requires the one-time token stored at ${getGeneratedTokenPath()}`
			: "Initial admin setup requires the configured one-time ownership token",
	);
};

const getSetupTokenFromRequest = (req) => {
	const value = req.get("x-shieldpm-setup-token");
	return typeof value === "string" ? value.trim() : "";
};

export {
	ensureInitialSetupOwnership,
	getGeneratedTokenPath,
	getSetupTokenFromRequest,
	retireGeneratedToken,
	SETUP_CLAIM_ID,
	validateTokenStrength,
};
