import crypto from "node:crypto";
import { getEncryptionKey } from "./config.js";

/**
 * Data-at-rest encryption for stored credentials (AES-256-GCM).
 *
 * Key custody: the key is loaded once from `keys.json` (or, if set, from
 * `SHIELDPM_ENCRYPTION_KEY`) and is shared by every encrypted column. A
 * `/data` backup therefore contains both ciphertext and key material unless
 * the operator keeps the key outside `/data` with `SHIELDPM_ENCRYPTION_KEY`.
 * See the key-custody notes in `lib/config.js`.
 *
 * Rotation is deliberately NOT implemented here. The serialized format
 * `iv:ciphertext:tag` has no key id, so a new key makes every existing value
 * unreadable. A safe rotation needs a versioned ciphertext (`v2:...`), dual-key
 * decryption during the transition, a re-encryption migration over every
 * encrypted column and a tested rollback. Treat a leaked key as a compromise
 * of every stored secret, not just of new writes.
 */
const algorithm = "aes-256-gcm";
const key = Buffer.from(getEncryptionKey(), "hex");

if (key.length !== 32) {
	throw new Error("The ShieldPM encryption key must be exactly 32 bytes (64 hexadecimal characters)");
}

export const encrypt = (text) => {
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv(algorithm, key, iv);
	let encrypted = cipher.update(text, "utf8", "hex");
	encrypted += cipher.final("hex");
	const authTag = cipher.getAuthTag().toString("hex");
	return `${iv.toString("hex")}:${encrypted}:${authTag}`;
};

export const decrypt = (text) => {
	if (typeof text !== "string") {
		throw new Error("Invalid encrypted text format");
	}
	const parts = text.split(":");
	if (
		parts.length !== 3 ||
		!/^[a-f0-9]{24}$/.test(parts[0]) ||
		!/^(?:[a-f0-9]{2})*$/.test(parts[1]) ||
		!/^[a-f0-9]{32}$/.test(parts[2])
	) {
		throw new Error("Invalid encrypted text format");
	}
	const iv = Buffer.from(parts[0], "hex");
	const encryptedText = parts[1];
	const authTag = Buffer.from(parts[2], "hex");

	const decipher = crypto.createDecipheriv(algorithm, key, iv, { authTagLength: 16 });
	decipher.setAuthTag(authTag);
	let decrypted = decipher.update(encryptedText, "hex", "utf8");
	decrypted += decipher.final("utf8");
	return decrypted;
};
