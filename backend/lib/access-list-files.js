import path from "node:path";
import errs from "./error.js";

/** One trusted data root and decimal ID for publication, Nginx rendering and revision capture.
 * @param {unknown} value
 * @param {{allowNone?: boolean}} [options]
 */
export function accessListFilename(value, options = {}) {
	const id = Number(value);
	const absent = options.allowNone && (value == null || id === 0);
	if (!absent && (!["number", "string"].includes(typeof value) || !Number.isSafeInteger(id) || id <= 0))
		throw new errs.ValidationError("Invalid access-list file ID");
	return path.resolve(process.env.DATA_PATH || "/data", "access", absent ? "0" : id.toString(10));
}

/** Only fixed-length hexadecimal version IDs may select an immutable authorization artifact. */
export function accessListFiles(list, base = accessListFilename(list.id, { allowNone: true })) {
	const revision = list.meta?.authorization_revision;
	const suffix = typeof revision === "string" && /^[a-f0-9]{64}$/.test(revision) ? `.${revision}` : "";
	return { auth: `${base}${suffix}`, ca: `${base}${suffix}.crt` };
}
