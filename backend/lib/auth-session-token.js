import crypto from "node:crypto";

const TOKEN_HASH_ALGORITHM = "sha256";
const RANDOM_ID_ENCODING = "hex";

export const hashToken = (rawToken) => {
	if (!rawToken || typeof rawToken !== "string") {
		throw new TypeError("rawToken must be a non-empty string");
	}

	return crypto.createHash(TOKEN_HASH_ALGORITHM).update(rawToken, "utf8").digest("hex");
};

export const createFamilyId = () => crypto.randomUUID();

export const createJti = () => crypto.randomBytes(16).toString(RANDOM_ID_ENCODING);

export const normalizeScope = (scope) => {
	if (Array.isArray(scope)) {
		return scope;
	}

	if (typeof scope === "string" && scope.trim()) {
		return [scope.trim()];
	}

	return [];
};
