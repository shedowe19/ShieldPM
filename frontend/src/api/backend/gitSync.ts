import * as api from "./base";

export interface GitSyncStatus {
	git_repo_url: string | null;
	git_branch: string;
	git_sync_enabled: boolean;
	git_poll_interval: number;
	git_poll_unit: "s" | "m" | "h";
	git_last_sync: string | null;
	git_last_commit: string | null;
	git_last_error: string | null;
	polling_active: boolean;
}

export interface GitSyncResult {
	success: boolean;
	commit?: string;
	message?: string;
}

export interface GitSyncConfig {
	git_repo_url?: string | null;
	git_branch?: string;
	git_sync_enabled?: boolean;
	git_poll_interval?: number;
	git_poll_unit?: "s" | "m" | "h";
	git_credentials?: string;
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
