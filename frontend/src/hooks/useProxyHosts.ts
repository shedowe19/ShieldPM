import { useQuery } from "@tanstack/react-query";
import {
	getProxyHosts,
	getProxyHostsPage,
	type ProxyHost,
	type ProxyHostExpansion,
	type ProxyHostPage,
	type ProxyHostPageParams,
} from "src/api/backend";

const fetchProxyHosts = (expand?: ProxyHostExpansion[], signal?: AbortSignal) => {
	return getProxyHosts(expand, {}, signal);
};

const useProxyHosts = (expand?: ProxyHostExpansion[], options = {}) => {
	return useQuery<ProxyHost[], Error>({
		queryKey: ["proxy-hosts", { expand }],
		queryFn: ({ signal }) => fetchProxyHosts(expand, signal),
		staleTime: 60 * 1000,
		...options,
	});
};

const fetchProxyHostsPage = (
	expand: ProxyHostExpansion[] | undefined,
	params: ProxyHostPageParams,
	signal?: AbortSignal,
) => {
	return getProxyHostsPage(expand, params, signal);
};

const useProxyHostsPage = (expand: ProxyHostExpansion[] | undefined, params: ProxyHostPageParams, options = {}) => {
	return useQuery<ProxyHostPage, Error>({
		queryKey: ["proxy-hosts", { expand, ...params }],
		queryFn: ({ signal }) => fetchProxyHostsPage(expand, params, signal),
		staleTime: 60 * 1000,
		...options,
	});
};

export { fetchProxyHosts, fetchProxyHostsPage, useProxyHosts, useProxyHostsPage };
