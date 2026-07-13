import { useQuery } from "@tanstack/react-query";
import { type AnalyticsTopHost, getAnalyticsTopHosts } from "src/api/backend";

const useAnalyticsTopHosts = () => {
	return useQuery<AnalyticsTopHost[], Error>({
		queryKey: ["analytics", "top-hosts"],
		queryFn: getAnalyticsTopHosts,
		refetchOnWindowFocus: false,
		staleTime: 60 * 1000,
	});
};

export { useAnalyticsTopHosts };
