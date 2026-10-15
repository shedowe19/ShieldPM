import { useQuery } from "@tanstack/react-query";
import * as api from "src/api/backend/base";
export interface AnalyticsHost {
	id: number;
	domainNames: string[];
}
export function useAnalyticsHosts() {
	return useQuery<AnalyticsHost[], Error>({
		queryKey: ["analytics-hosts"],
		queryFn: ({ signal }) => api.get({ url: "/analytics/hosts" }, { signal }),
	});
}
