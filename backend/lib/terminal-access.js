import { createHmac, timingSafeEqual } from "node:crypto";
import { getEncryptionKey } from "./config.js";

/** Bind the trusted Nginx terminal handoff to one host without exposing the signing key. */
export const getTerminalAccessToken = (hostId) =>
	createHmac("sha256", Buffer.from(getEncryptionKey(), "hex"))
		.update(`shieldpm:terminal:v1:${Number(hostId)}`)
		.digest("hex");

/** Validate a handoff token before reading SSH credentials or opening a connection. */
export const isValidTerminalAccessToken = (hostId, token) => {
	if (!Number.isSafeInteger(Number(hostId)) || Number(hostId) <= 0 || typeof token !== "string") return false;
	if (!/^[a-f0-9]{64}$/.test(token)) return false;
	return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(getTerminalAccessToken(hostId), "hex"));
};
