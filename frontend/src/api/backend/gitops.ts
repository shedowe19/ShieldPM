import type { GitOpsAuthType } from "src/types/enums";
import { get, post, put } from "./base";

/**
 * GitOps Configuration
 */
export interface GitOpsConfig {
	enabled: boolean;
	repositoryUrl: string;
	branch: string;
	authType: GitOpsAuthType;
	hasCredentials: boolean;
	autoPush: boolean;
	autoPullOnStartup: boolean;
	lastSync: string | null;
	lastError: string | null;
}

/**
 * GitOps Config update payload
 */
export interface GitOpsConfigUpdate {
	enabled?: boolean;
	repositoryUrl?: string;
	branch?: string;
	authType?: GitOpsAuthType;
	credentials?: string; // Plain credentials for update
	autoPush?: boolean;
	autoPullOnStartup?: boolean;
}

/**
 * Git Commit
 */
export interface GitCommit {
	sha: string;
	message: string;
	author: string;
	date: string;
}

/**
 * GitOps Operation Result
 */
export interface GitOpsResult {
	success: boolean;
	message?: string;
	warning?: string;
	commit?: string;
}

/**
 * GitOps Import Result
 */
export interface GitOpsImportResult {
	success: boolean;
	imported: number;
	skipped: number;
	deleted: number;
	dryRun: boolean;
	errors: string[];
}

/**
 * Get GitOps configuration
 */
export async function getGitOpsConfig(): Promise<GitOpsConfig> {
	return get({ url: "/gitops/config" });
}

/**
 * Update GitOps configuration
 */
export async function updateGitOpsConfig(data: GitOpsConfigUpdate): Promise<GitOpsConfig> {
	return put({ url: "/gitops/config", data });
}

/**
 * Test repository connection
 */
export async function testGitOpsConnection(): Promise<GitOpsResult> {
	return post({ url: "/gitops/test" });
}

/**
 * Export current configuration
 */
export async function exportGitOpsConfig(): Promise<{ success: boolean; filesExported: number }> {
	return post({ url: "/gitops/export" });
}

/**
 * Push to remote repository
 */
export async function pushGitOps(message?: string): Promise<GitOpsResult> {
	return post({ url: "/gitops/push", data: { message } });
}

/**
 * Pull from remote repository
 */
export async function pullGitOps(): Promise<GitOpsResult> {
	return post({ url: "/gitops/pull" });
}

/**
 * Get commit history
 */
export async function getGitOpsHistory(limit = 20): Promise<GitCommit[]> {
	return get({ url: "/gitops/history", params: { limit } });
}

/**
 * Revert to a specific commit
 */
export async function revertGitOps(sha: string): Promise<GitOpsResult> {
	return post({ url: "/gitops/revert", data: { sha } });
}

/**
 * Import configuration from Git
 */
export async function importGitOpsConfig(overwrite = false, dryRun = false): Promise<GitOpsImportResult> {
	return post({ url: "/gitops/import", data: { overwrite, dryRun } });
}
