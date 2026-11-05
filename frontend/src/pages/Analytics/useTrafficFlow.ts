import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getTrafficFlow } from "src/api/backend/getTrafficFlow";
import { usePollingEnvironment } from "src/hooks/usePollingEnvironment";

const queryKey = ["traffic-flow"];

export function useTrafficFlow(paused: boolean) {
	const client = useQueryClient();
	const { isDocumentVisible, isOnline } = usePollingEnvironment();
	const available = isDocumentVisible && isOnline;
	const active = !paused && available;
	useEffect(() => {
		if (!active) void client.cancelQueries({ queryKey });
	}, [active, client]);
	const query = useQuery({
		queryKey,
		queryFn: ({ signal }) => getTrafficFlow(signal),
		enabled: active,
		retry: false,
		staleTime: 0,
		gcTime: 0,
		refetchOnWindowFocus: false,
		refetchInterval: (current) =>
			active && current.state.data?.enabled !== false
				? Math.min(40_000, 5_000 * 2 ** current.state.fetchFailureCount)
				: false,
	});
	return { ...query, available };
}
