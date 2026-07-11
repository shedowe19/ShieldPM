import { useQuery } from "@tanstack/react-query";
import { getHealth, type HealthResponse } from "src/api/backend";
import { getPollingInterval } from "./pollingPolicy";
import { usePollingEnvironment } from "./usePollingEnvironment";

const fetchHealth = () => getHealth();

const useHealth = (options = {}) => {
	const pollingEnvironment = usePollingEnvironment();

	return useQuery<HealthResponse, Error>({
		queryKey: ["health"],
		queryFn: fetchHealth,
		refetchOnWindowFocus: false,
		retry: 5,
		refetchInterval: (query) =>
			getPollingInterval({
				baseIntervalMs: 15_000,
				failureCount: query.state.fetchFailureCount,
				...pollingEnvironment,
			}),
		staleTime: 14 * 1000, // 14 seconds
		...options,
	});
};

export { fetchHealth, useHealth };
