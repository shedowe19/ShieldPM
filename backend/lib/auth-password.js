import errs from "./error.js";

/** Validate local password credentials before a model can persist an unsupported auth type. */
export const validatePasswordAuth = (auth) => {
	if (auth?.type !== "password") {
		throw new errs.ValidationError("Only password authentication can be created or changed here");
	}
	if (typeof auth.secret !== "string" || [...auth.secret].length < 8 || Buffer.byteLength(auth.secret, "utf8") > 72) {
		throw new errs.ValidationError("Password must contain at least 8 characters and at most 72 UTF-8 bytes");
	}
};
