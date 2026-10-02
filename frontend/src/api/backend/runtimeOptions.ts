import * as api from "./base";

export interface CertificateOptions {
	keyType: "ecdsa" | "rsa";
	renewalIntervalHours: number;
}

export interface IpRangesOptions {
	enabled: boolean;
	refreshIntervalHours: number;
}

export interface AnalyticsOptions {
	detailedRetentionHours: number;
	aggregationRetentionDays: number;
}

export interface NginxOptions {
	beautifierEnabled: boolean;
}

export const getCertificateOptions = () => api.get<CertificateOptions>({ url: "/settings/certificate-options" });
export const updateCertificateOptions = (data: CertificateOptions) =>
	api.put<CertificateOptions>({ url: "/settings/certificate-options", data });
export const getIpRangesOptions = () => api.get<IpRangesOptions>({ url: "/settings/ip-ranges-options" });
export const updateIpRangesOptions = (data: IpRangesOptions) =>
	api.put<IpRangesOptions>({ url: "/settings/ip-ranges-options", data });
export const getAnalyticsOptions = () => api.get<AnalyticsOptions>({ url: "/settings/analytics-options" });
export const updateAnalyticsOptions = (data: AnalyticsOptions) =>
	api.put<AnalyticsOptions>({ url: "/settings/analytics-options", data });
export const getNginxOptions = () => api.get<NginxOptions>({ url: "/settings/nginx-options" });
export const updateNginxOptions = (data: NginxOptions) =>
	api.put<NginxOptions>({ url: "/settings/nginx-options", data });
