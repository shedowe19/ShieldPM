import crypto from "node:crypto";
import { getEncryptionKey } from "./config.js";

/**
 * Data-at-rest encryption for stored credentials (AES-256-GCM).
 *
 * Key custody: the active key is loaded once from `keys.json` (or, if set, from
 * `SHIELDPM_ENCRYPTION_KEY`) and is shared by every encrypted column. A
 * `/data` backup therefore contains both ciphertext and key material unless
 * the operator keeps the key outside `/data` with `SHIELDPM_ENCRYPTION_KEY`.
 * See the key-custody notes in `lib/config.js`.
 *
 * Ciphertext format:
 * - `v2:<key-id>:<iv>:<ciphertext>:<tag>` – current format. The key id is the
 *   first 16 hex characters of SHA-256(key), so a value names the key that
 *   produced it without revealing the key.
 * - `<iv>:<ciphertext>:<tag>` – legacy format without a key id. It is still
 *   decrypted, using the active key first and then each configured previous
 *   key, so an upgrade does not make existing secrets unreadable.
 *
 * Rotation: set `SHIELDPM_ENCRYPTION_KEY` to the new key and
 * `SHIELDPM_ENCRYPTION_KEY_PREVIOUS` to the old key (comma-separated for more
 * than one old key), start ShieldPM, and run
 * `node backend/scripts/rotate-encryption-key.js`. The script re-encrypts every
 * protected column with the active key; remove the previous-key variable and
 * restart afterwards. Values encrypted with an unknown key id are rejected
 * rather than guessed.
 */
const algorithm = "aes-256-gcm";
const envelopeVersion = "v2";
const keyIdLength = 16;
const keyPattern = /^[a-f0-9]{64}$/i;
const ivPattern = /^[a-f0-9]{24}$/;
const ciphertextPattern = /^(?:[a-f0-9]{2})*$/;
const tagPattern = /^[a-f0-9]{32}$/;
const keyIdPattern = /^[a-f0-9]{16}$/;

const parseKey = (raw, source) => {
	const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
	if (!keyPattern.test(value)) {
		throw new Error(`${source} must be exactly 64 hexadecimal characters (32 bytes)`);
	}
	return Buffer.from(value, "hex");
};

const keyIdFor = (key) => crypto.createHash("sha256").update(key).digest("hex").slice(0, keyIdLength);

const activeKey = parseKey(getEncryptionKey(), "The ShieldPM encryption key");
const previousKeys = (process.env.SHIELDPM_ENCRYPTION_KEY_PREVIOUS || "")
	.split(",")
	.map((value) => value.trim())
	.filter(Boolean)
	.map((value) => parseKey(value, "SHIELDPM_ENCRYPTION_KEY_PREVIOUS"));

const activeKeyId = keyIdFor(activeKey);
const keyRing = new Map();
for (const key of [activeKey, ...previousKeys]) {
	keyRing.set(keyIdFor(key), key);
}

const decryptWithKey = (key, ivHex, encryptedHex, tagHex) => {
	const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivHex, "hex"), { authTagLength: 16 });
	decipher.setAuthTag(Buffer.from(tagHex, "hex"));
	let decrypted = decipher.update(encryptedHex, "hex", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
};

const isLegacyEnvelope = (parts) =>
	parts.length === 3 && ivPattern.test(parts[0]) && ciphertextPattern.test(parts[1]) && tagPattern.test(parts[2]);

export const encrypt = (text) => {
	if (typeof text !== "string") {
		throw new Error("Invalid plaintext format");
	}
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(algorithm, activeKey, iv);
	let encrypted = cipher.update(text, "utf8", "hex");
	encrypted += cipher.final("hex");
	const authTag = cipher.getAuthTag().toString("hex");
	return `${envelopeVersion}:${activeKeyId}:${iv.toString("hex")}:${encrypted}:${authTag}`;
};

export const decrypt = (text) => {
	if (typeof text !== "string") {
		throw new Error("Invalid encrypted text format");
	}
	const parts = text.split(":");

	if (parts[0] === envelopeVersion && parts.length === 5) {
		const [, keyId, ivHex, encryptedHex, tagHex] = parts;
		if (
			!keyIdPattern.test(keyId) ||
			!ivPattern.test(ivHex) ||
			!ciphertextPattern.test(encryptedHex) ||
			!tagPattern.test(tagHex)
		) {
			throw new Error("Invalid encrypted text format");
		}
		const key = keyRing.get(keyId);
		if (!key) {
			throw new Error("Unknown encryption key id");
		}
		return decryptWithKey(key, ivHex, encryptedHex, tagHex);
	}

	if (isLegacyEnvelope(parts)) {
		let lastError = null;
		for (const key of keyRing.values()) {
			try {
				return decryptWithKey(key, parts[0], parts[1], parts[2]);
			} catch (error) {
				lastError = error;
			}
		}
		throw lastError || new Error("Invalid encrypted text format");
	}

	throw new Error("Invalid encrypted text format");
};

/**
 * Returns whether a string is a ShieldPM ciphertext envelope, without trying
 * to decrypt it. Used by the rotation command and by lazy re-encryption.
 */
export const isEncrypted = (text) => {
	if (typeof text !== "string") return false;
	const parts = text.split(":");
	if (parts[0] === envelopeVersion && parts.length === 5) {
		return (
			keyIdPattern.test(parts[1]) &&
			ivPattern.test(parts[2]) &&
			ciphertextPattern.test(parts[3]) &&
			tagPattern.test(parts[4])
		);
	}
	return isLegacyEnvelope(parts);
};

/**
 * True when a value is readable but not encrypted with the active key.
 * Plaintext is deliberately reported as false: the rotation command only
 * touches values that already use the encryption envelope.
 */
export const needsRotation = (text) => {
	if (!isEncrypted(text)) return false;
	const parts = text.split(":");
	if (parts[0] === envelopeVersion) return parts[1] !== activeKeyId;
	return true;
};

export const getActiveKeyId = () => activeKeyId;
