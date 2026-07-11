import { useQuery } from "@tanstack/react-query";
import { getHostsReport } from "src/api/backend";
import { getPollingInterval } from "./pollingPolicy";
import { usePollingEnvironment } from "./usePollingEnvironment";

const fetchHostReport = () => getHostsReport();

const useHostReport = (options = {}) => {
	const pollingEnvironment = usePollingEnvironment();

	return useQuery<Record<string, number>, Error>({
		queryKey: ["host-report"],
		queryFn: fetchHostReport,
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

export { fetchHostReport, useHostReport };
