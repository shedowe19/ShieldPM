import * as api from "./base";

export interface FirewallList {
	id: number;
	name: string;
	reason: string;
	description: string;
	sourceType: "manual" | "url";
	sourceUrl: string;
	updateIntervalHours: number;
	enabled: boolean;
	entryCount: number;
	lastUpdatedOn: string | null;
	lastError: string | null;
	entries?: string;
}

export interface FirewallListInput {
	name: string;
	reason: string;
	description: string;
	sourceType: "manual" | "url";
	sourceUrl: string;
	updateIntervalHours: number;
	enabled: boolean;
	entries?: string;
}

export interface FirewallListPreview {
	entries: string[];
	duplicates: number;
	invalid: { line: number; value: string }[];
	totalLines: number;
}

const endpoint = "/nginx/firewall-lists";

export function getFirewallLists(): Promise<FirewallList[]> {
	return api.get({ url: endpoint });
}

export function getFirewallList(id: number): Promise<FirewallList> {
	return api.get({ url: `${endpoint}/${id}` });
}

export function createFirewallList(data: FirewallListInput): Promise<FirewallList> {
	return api.post({ url: endpoint, data });
}

export function updateFirewallList(id: number, data: FirewallListInput): Promise<FirewallList> {
	return api.put({ url: `${endpoint}/${id}`, data });
}

export function deleteFirewallList(id: number): Promise<void> {
	return api.del({ url: `${endpoint}/${id}` });
}

export function refreshFirewallList(id: number): Promise<FirewallList> {
	return api.post({ url: `${endpoint}/${id}/refresh` });
}

export function previewFirewallList(entries: string): Promise<FirewallListPreview> {
	return api.post({ url: `${endpoint}/preview`, data: { entries } });
}
