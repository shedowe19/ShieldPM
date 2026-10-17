import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	checkProxyHostMonitor,
	getProxyHostMonitor,
	getProxyHostMonitorStatuses,
	type ProxyHostMonitorConfig,
	updateProxyHostMonitor,
} from "src/api/backend/proxyHostMonitor";

export function useProxyHostMonitorStatuses(ids: number[]) {
	const idsKey = ids.join(",");
	return useQuery({
		queryKey: ["proxy-host-monitors", "statuses", idsKey],
		queryFn: ({ signal }) => getProxyHostMonitorStatuses(ids, signal),
		enabled: ids.length > 0,
		// Revealing a column must refresh even within the app's default stale window.
		staleTime: 0,
		refetchInterval: 30_000,
	});
}

export function useProxyHostMonitor(id: number) {
	return useQuery({
		queryKey: ["proxy-host-monitors", id],
		queryFn: () => getProxyHostMonitor(id),
		refetchOnMount: "always",
		refetchInterval: 30_000,
	});
}

export function useUpdateProxyHostMonitor(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: (config: ProxyHostMonitorConfig) => updateProxyHostMonitor(id, config),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["proxy-host-monitors", id] });
			queryClient.invalidateQueries({ queryKey: ["proxy-host-monitors", "statuses"] });
		},
	});
}

export function useCheckProxyHostMonitor(id: number) {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: () => checkProxyHostMonitor(id),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["proxy-host-monitors", id] });
			queryClient.invalidateQueries({ queryKey: ["proxy-host-monitors", "statuses"] });
		},
	});
}
