import * as api from "./base";

export type ProxyHostMonitorState = "up" | "down" | "unknown" | "paused";

export interface ProxyHostMonitorConfig {
	enabled: boolean;
	type: "http" | "tcp";
	path: string;
	intervalSeconds: number;
	timeoutMs: number;
	expectedStatus: number;
	alertEnabled: boolean;
}

export interface ProxyHostMonitorStatus {
	state: ProxyHostMonitorState;
	checkedAt: string | null;
	responseMs: number | null;
	statusCode?: number | null;
	message?: string | null;
}

export interface ProxyHostMonitorHistory extends ProxyHostMonitorStatus {
	id: number;
	transition: boolean;
}

export interface ProxyHostMonitorDetail {
	config: ProxyHostMonitorConfig | null;
	status: ProxyHostMonitorStatus | null;
	history: ProxyHostMonitorHistory[];
}

export interface ProxyHostMonitorSummary extends ProxyHostMonitorStatus {
	hostId: number;
}

export function getProxyHostMonitor(id: number): Promise<ProxyHostMonitorDetail> {
	return api.get({ url: `/nginx/proxy-hosts/${id}/monitor` });
}

export function getProxyHostMonitorStatuses(ids: number[]): Promise<ProxyHostMonitorSummary[]> {
	return api.get({ url: "/nginx/proxy-hosts/monitors/status", params: { ids: ids.join(",") } });
}

export function updateProxyHostMonitor(id: number, config: ProxyHostMonitorConfig): Promise<ProxyHostMonitorDetail> {
	return api.put({ url: `/nginx/proxy-hosts/${id}/monitor`, data: config });
}

export function checkProxyHostMonitor(id: number): Promise<ProxyHostMonitorStatus & { transition: boolean }> {
	return api.post({ url: `/nginx/proxy-hosts/${id}/monitor/check`, data: {} });
}
