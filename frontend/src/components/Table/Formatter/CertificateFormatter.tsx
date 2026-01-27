import { T } from "src/locale";
import { CERTIFICATE_PROVIDER } from "src/types/enums";

interface FormatterProps {
	value: unknown;
	tData?: unknown;
}

import type { Certificate } from "src/api/backend";

export const CertificateFormatter = ({ value }: FormatterProps) => {
	const cert = value as Certificate | undefined;
	let translation = "http-only";

	if (cert) {
		translation = cert.provider;
		if (translation === CERTIFICATE_PROVIDER.LETSENCRYPT) {
			translation = "lets-encrypt";
		} else if (translation === "other") {
			translation = "certificates.custom";
		}
	}

	return <T id={translation} />;
};
