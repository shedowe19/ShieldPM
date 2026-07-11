import { useQuery } from "@tanstack/react-query";
import { checkVersion, type VersionCheckResponse } from "src/api/backend";
import { getPollingInterval } from "./pollingPolicy";
import { usePollingEnvironment } from "./usePollingEnvironment";

const fetchVersion = () => checkVersion();

const useCheckVersion = (options = {}) => {
	const pollingEnvironment = usePollingEnvironment();

	return useQuery<VersionCheckResponse, Error>({
		queryKey: ["version-check"],
		queryFn: fetchVersion,
		refetchOnWindowFocus: false,
		retry: 5,
		refetchInterval: (query) =>
			getPollingInterval({
				baseIntervalMs: 30_000,
				failureCount: query.state.fetchFailureCount,
				...pollingEnvironment,
			}),
		staleTime: 5 * 60 * 1000, // 5 mins
		...options,
	});
};

export { fetchVersion, useCheckVersion };
