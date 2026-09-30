import * as api from "./base";

export interface CertificateOptions {
	keyType: "ecdsa" | "rsa";
	renewalIntervalHours: number;
}

export interface IpRangesOptions {
	enabled: boolean;
	refreshIntervalHours: number;
}

export const getCertificateOptions = () => api.get<CertificateOptions>({ url: "/settings/certificate-options" });
export const updateCertificateOptions = (data: CertificateOptions) =>
	api.put<CertificateOptions>({ url: "/settings/certificate-options", data });
export const getIpRangesOptions = () => api.get<IpRangesOptions>({ url: "/settings/ip-ranges-options" });
export const updateIpRangesOptions = (data: IpRangesOptions) =>
	api.put<IpRangesOptions>({ url: "/settings/ip-ranges-options", data });
