import * as api from "./base";
import type { CertificateProfile } from "./models";

export interface AcmeProfileSettings {
	profile: CertificateProfile;
}

export async function getAcmeProfile(): Promise<AcmeProfileSettings> {
	return api.get<AcmeProfileSettings>({ url: "/nginx/certificates/acme-profile" });
}

export async function updateAcmeProfile(settings: Pick<AcmeProfileSettings, "profile">): Promise<AcmeProfileSettings> {
	return api.put<AcmeProfileSettings>({ url: "/nginx/certificates/acme-profile", data: settings });
}
