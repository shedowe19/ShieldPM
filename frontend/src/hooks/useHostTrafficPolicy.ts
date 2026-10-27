import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getHostCacheStatus, getUpstreamPoolStatus, purgeHostCache } from "src/api/backend/hostTrafficPolicy";
export function useUpstreamPoolStatus(id: number | null) {
	return useQuery({
		queryKey: ["upstream-pool-status", id],
		queryFn: ({ signal }) => getUpstreamPoolStatus(id as number, signal),
		enabled: !!id,
		refetchInterval: 30000,
	});
}
export function useHostCacheStatus(id: number | null) {
	return useQuery({
		queryKey: ["host-cache-status", id],
		queryFn: ({ signal }) => getHostCacheStatus(id as number, signal),
		enabled: !!id,
		refetchInterval: 30000,
	});
}
export function usePurgeHostCache(id: number | null) {
	const client = useQueryClient();
	return useMutation({
		mutationFn: (path?: string) => purgeHostCache(id as number, path),
		onSuccess: () => client.invalidateQueries({ queryKey: ["host-cache-status", id] }),
	});
}
