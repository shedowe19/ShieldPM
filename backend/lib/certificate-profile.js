import errs from "./error.js";

/** Validate a new certificate's profile, defaulting omitted selections to Standard. */
export const getCertificateProfile = (meta) => {
	const profile = meta?.letsencrypt_profile;
	if (profile === undefined) return "standard";
	if (profile !== "standard" && profile !== "shortlived") {
		throw new errs.ValidationError("Certificate profile must be 'standard' or 'shortlived'");
	}
	return profile;
};

/** Override global settings per certificate while retaining legacy lineage configuration. */
export const getCertificateProfileArgs = (certificate) => {
	if (certificate.meta?.letsencrypt_profile === undefined) return [];
	if (getCertificateProfile(certificate.meta) === "shortlived") return ["--required-profile", "shortlived"];
	// runtime-config.sh writes ACME_PROFILE into certbot.ini. Clear it for Standard,
	// but avoid new CLI switches on older Certbot installations with no global profile.
	return process.env.ACME_PROFILE && process.env.ACME_PROFILE !== "none"
		? ["--required-profile", "", "--preferred-profile", ""]
		: [];
};
