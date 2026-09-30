import errs from "./error.js";

/** Resolve the new-certificate default while preserving compatibility with legacy CA settings. */
export const resolveDefaultProfile = (policy) =>
	policy === "shortlived" || (policy === "inherit" && process.env.ACME_PROFILE === "shortlived")
		? "shortlived"
		: "standard";

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
export const getCertificateProfileArgs = (certificate, policy = "inherit") => {
	const explicitProfile = certificate.meta?.letsencrypt_profile;
	if (explicitProfile === undefined && policy === "inherit") return [];
	const profile =
		explicitProfile === undefined
			? getCertificateProfile({ letsencrypt_profile: policy })
			: getCertificateProfile(certificate.meta);
	if (profile === "shortlived") return ["--required-profile", "shortlived"];
	// runtime-config.sh writes ACME_PROFILE into certbot.ini. Clear it for Standard,
	// but avoid new CLI switches on older Certbot installations with no global profile.
	return (explicitProfile === undefined && policy === "standard") ||
		(process.env.ACME_PROFILE && process.env.ACME_PROFILE !== "none")
		? ["--required-profile", "", "--preferred-profile", ""]
		: [];
};
