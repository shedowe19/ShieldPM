import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	getGitSyncStatus,
	triggerGitSync,
	updateGitSyncConfig,
	type GitSyncConfig,
	type GitSyncResult,
	type GitSyncStatus,
} from "src/api/backend/gitSync";

/**
 * Hook to get Git sync status for a proxy host
 */
export function useGitSyncStatus(hostId: number | null) {
	return useQuery<GitSyncStatus>({
		queryKey: ["git-sync-status", hostId],
		queryFn: () => (hostId ? getGitSyncStatus(hostId) : Promise.reject("No host ID")),
		enabled: !!hostId,
		refetchInterval: 30000, // Refresh every 30 seconds
	});
}

/**
 * Hook to trigger a manual Git sync
 */
export function useTriggerGitSync() {
	const queryClient = useQueryClient();

	return useMutation<GitSyncResult, Error, number>({
		mutationFn: (hostId: number) => triggerGitSync(hostId),
		onSuccess: (_data: GitSyncResult, hostId: number) => {
			queryClient.invalidateQueries({ queryKey: ["git-sync-status", hostId] });
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		},
	});
}

/**
 * Hook to update Git sync configuration
 */
export function useUpdateGitSyncConfig() {
	const queryClient = useQueryClient();

	return useMutation<GitSyncStatus, Error, { hostId: number; config: GitSyncConfig }>({
		mutationFn: ({ hostId, config }: { hostId: number; config: GitSyncConfig }) =>
			updateGitSyncConfig(hostId, config),
		onSuccess: (_data: GitSyncStatus, { hostId }: { hostId: number }) => {
			queryClient.invalidateQueries({ queryKey: ["git-sync-status", hostId] });
			queryClient.invalidateQueries({ queryKey: ["proxy-hosts"] });
		},
	});
}
