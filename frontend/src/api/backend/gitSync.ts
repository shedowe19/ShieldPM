import * as api from "./base";

export interface GitSyncStatus {
	gitRepoUrl: string | null;
	gitBranch: string;
	gitSyncEnabled: boolean;
	gitPollInterval: number;
	gitPollUnit: "s" | "m" | "h";
	gitLastSync: string | null;
	gitLastCommit: string | null;
	gitLastError: string | null;
	pollingActive: boolean;
}

export interface GitSyncResult {
	success: boolean;
	commit?: string;
	message?: string;
}

export interface GitSyncConfig {
	gitRepoUrl?: string | null;
	gitBranch?: string;
	gitSyncEnabled?: boolean;
	gitPollInterval?: number;
	gitPollUnit?: "s" | "m" | "h";
	gitCredentials?: string;
}

/**
 * Get Git sync status for a proxy host
 */
export async function getGitSyncStatus(hostId: number): Promise<GitSyncStatus> {
	return await api.get({
		url: `/nginx/proxy-hosts/${hostId}/git-status`,
	});
}

/**
 * Trigger a manual Git sync for a proxy host
 */
export async function triggerGitSync(hostId: number): Promise<GitSyncResult> {
	return await api.post({
		url: `/nginx/proxy-hosts/${hostId}/git-sync`,
		data: {},
	});
}

/**
 * Update Git sync configuration for a proxy host
 */
export async function updateGitSyncConfig(hostId: number, config: GitSyncConfig): Promise<GitSyncStatus> {
	return await api.put({
		url: `/nginx/proxy-hosts/${hostId}/git-status`,
		data: config,
	});
}
