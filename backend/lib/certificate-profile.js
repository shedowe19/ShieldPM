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

/** Apply the stored profile and clear obsolete Certbot configuration for Standard. */
export const getCertificateProfileArgs = (certificate, policy = "standard") => {
	const explicitProfile = certificate.meta?.letsencrypt_profile;
	const profile =
		explicitProfile === undefined
			? getCertificateProfile({ letsencrypt_profile: policy })
			: getCertificateProfile(certificate.meta);
	if (profile === "shortlived") return ["--required-profile", "shortlived"];
	// Both options can remain in a previous Certbot INI or renewal lineage.
	return ["--required-profile", "", "--preferred-profile", ""];
};
