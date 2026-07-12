import { useQuery } from "@tanstack/react-query";
import {
	getProxyHosts,
	getProxyHostsPage,
	type ProxyHost,
	type ProxyHostExpansion,
	type ProxyHostPage,
	type ProxyHostPageParams,
} from "src/api/backend";

const fetchProxyHosts = (expand?: ProxyHostExpansion[]) => {
	return getProxyHosts(expand);
};

const useProxyHosts = (expand?: ProxyHostExpansion[], options = {}) => {
	return useQuery<ProxyHost[], Error>({
		queryKey: ["proxy-hosts", { expand }],
		queryFn: () => fetchProxyHosts(expand),
		staleTime: 60 * 1000,
		...options,
	});
};

const fetchProxyHostsPage = (expand: ProxyHostExpansion[] | undefined, params: ProxyHostPageParams) => {
	return getProxyHostsPage(expand, params);
};

const useProxyHostsPage = (expand: ProxyHostExpansion[] | undefined, params: ProxyHostPageParams, options = {}) => {
	return useQuery<ProxyHostPage, Error>({
		queryKey: ["proxy-hosts", { expand, ...params }],
		queryFn: () => fetchProxyHostsPage(expand, params),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchProxyHosts, fetchProxyHostsPage, useProxyHosts, useProxyHostsPage };
