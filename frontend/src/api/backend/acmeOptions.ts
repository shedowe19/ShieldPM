import * as api from "./base";

export interface AcmeOptionsValues {
	server: string;
	email: string;
	accountId: string;
	eabKid: string;
	agreeTos: boolean;
	mustStaple: boolean;
	ocspStapling: boolean;
	serverTlsVerify: boolean;
	customOcspStapling: boolean;
	defaultCertificateId: number;
}

export interface AcmeOptions extends AcmeOptionsValues {
	eabHmacKeySet: boolean;
}

export interface AcmeOptionsUpdate extends AcmeOptionsValues {
	eabHmacKey?: string | null;
}

export const getAcmeOptions = () => api.get<AcmeOptions>({ url: "/settings/acme-options" });
export const updateAcmeOptions = (data: AcmeOptionsUpdate) =>
	api.put<AcmeOptions>({ url: "/settings/acme-options", data });
