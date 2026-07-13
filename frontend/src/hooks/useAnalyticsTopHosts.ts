import { useQuery } from "@tanstack/react-query";
import { type AnalyticsTopHost, type AnalyticsTopHostsSort, getAnalyticsTopHosts } from "src/api/backend";

const useAnalyticsTopHosts = (sort: AnalyticsTopHostsSort = "requests") => {
	return useQuery<AnalyticsTopHost[], Error>({
		queryKey: ["analytics", "top-hosts", sort],
		queryFn: () => getAnalyticsTopHosts(sort),
		refetchOnWindowFocus: false,
		staleTime: 60 * 1000,
	});
};

export { useAnalyticsTopHosts };
