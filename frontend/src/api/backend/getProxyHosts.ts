import * as api from "./base";
import type { ProxyHostExpansion } from "./expansions";
import type { ProxyHost } from "./models";

export interface ProxyHostPage {
	items: ProxyHost[];
	pagination: {
		limit: number;
		page: number;
		totalItems: number;
		totalPages: number;
	};
}

export interface ProxyHostPageParams {
	limit: number;
	page: number;
	query?: string;
}

export async function getProxyHosts(
	expand?: ProxyHostExpansion[],
	params?: Record<string, string | number | boolean | undefined>,
	signal?: AbortSignal,
): Promise<ProxyHost[]> {
	return await api.get(
		{
			url: "/nginx/proxy-hosts",
			params: {
				expand: expand?.join(","),
				...params,
			},
		},
		signal ? { signal } : undefined,
	);
}

export async function getProxyHostsPage(
	expand: ProxyHostExpansion[] | undefined,
	params: ProxyHostPageParams,
	signal?: AbortSignal,
): Promise<ProxyHostPage> {
	return await api.get(
		{
			url: "/nginx/proxy-hosts",
			params: {
				expand: expand?.join(","),
				...params,
			},
		},
		signal ? { signal } : undefined,
	);
}
