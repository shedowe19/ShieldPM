import { useQuery } from "@tanstack/react-query";
import { getProxyHosts, type ProxyHost, type ProxyHostExpansion } from "src/api/backend";
import type { PaginationResult } from "src/api/backend/getProxyHosts";

interface UseProxyHostsParams {
	page?: number;
	limit?: number;
	query?: string;
	[key: string]: unknown;
}

const fetchProxyHosts = (expand?: ProxyHostExpansion[], params?: UseProxyHostsParams) => {
	return getProxyHosts(expand, params);
};

const useProxyHosts = (expand?: ProxyHostExpansion[], params?: UseProxyHostsParams, options = {}) => {
	return useQuery<ProxyHost[] | PaginationResult<ProxyHost>, Error>({
		queryKey: ["proxy-hosts", { expand, ...params }],
		queryFn: () => fetchProxyHosts(expand, params),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchProxyHosts, useProxyHosts };
