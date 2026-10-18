import * as api from "./base";
export interface UpstreamTarget {
	id: string;
	label: string;
	host: string;
	port: number;
	weight: number;
	backup: boolean;
	maxFails: number;
	failTimeout: number;
}
export interface UpstreamPoolPolicy {
	enabled: boolean;
	targets: UpstreamTarget[];
	connectTimeout: number;
	readTimeout: number;
	hostHeader?: string;
	tlsServerName?: string;
	tlsVerify: boolean;
}
export interface CachePolicy {
	enabled: boolean;
	ttlSeconds: number;
	maxSizeMb: number;
	inactiveSeconds: number;
	assetsOnly: boolean;
	cacheKey: "uri" | "uri_ignore_query";
	routes: Array<{ path: string; ttlSeconds: number }>;
}
export interface UpstreamPoolStatus {
	enabled: boolean;
	checkedAt: string | null;
	observation: "tcp";
	targets: Array<
		UpstreamTarget & {
			state: "up" | "down";
			responseMs: number;
			observedRequests: number | null;
			monitor?: {
				state: "up" | "down" | "unknown";
				responseMs: number;
				checkedAt: string;
				statusCode: number | null;
				message: string;
			} | null;
		}
	>;
}
export interface HostCacheStatus {
	enabled: boolean;
	protectedBypass: boolean;
	policy: CachePolicy | null;
	counts: Record<string, number>;
	hitRatio: number | null;
	sampleRequests: number;
	sampleLimitBytes: number;
}
export const defaultUpstreamPool = (): UpstreamPoolPolicy => ({
	enabled: false,
	targets: [],
	connectTimeout: 5,
	readTimeout: 60,
	tlsVerify: true,
});
export const defaultCachePolicy = (enabled = false): CachePolicy => ({
	enabled,
	ttlSeconds: 3600,
	maxSizeMb: 256,
	inactiveSeconds: 86400,
	assetsOnly: true,
	cacheKey: "uri",
	routes: [{ path: "/", ttlSeconds: 3600 }],
});
export const getUpstreamPoolStatus = (id: number, signal?: AbortSignal): Promise<UpstreamPoolStatus> =>
	api.get({ url: `/nginx/proxy-hosts/${id}/upstream-pool/status` }, signal ? { signal } : undefined);
export const getHostCacheStatus = (id: number, signal?: AbortSignal): Promise<HostCacheStatus> =>
	api.get({ url: `/nginx/proxy-hosts/${id}/cache/status` }, signal ? { signal } : undefined);
export const purgeHostCache = (id: number, path?: string): Promise<{ removed: number; path: string | null }> =>
	api.del({ url: `/nginx/proxy-hosts/${id}/cache`, params: path ? { path } : undefined });
