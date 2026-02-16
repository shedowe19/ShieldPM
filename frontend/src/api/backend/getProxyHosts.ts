import * as api from "./base";
import type { ProxyHostExpansion } from "./expansions";
import type { ProxyHost } from "./models";

export interface PaginationResult<T> {
	data: T[];
	pagination: {
		page: number;
		limit: number;
		total: number;
	};
}

interface GetProxyHostsParams {
	page?: number;
	limit?: number;
	query?: string;
	[key: string]: unknown;
}

export async function getProxyHosts(
	expand?: ProxyHostExpansion[],
	params: GetProxyHostsParams = {},
): Promise<ProxyHost[] | PaginationResult<ProxyHost>> {
	return await api.get({
		url: "/nginx/proxy-hosts",
		params: {
			expand: expand?.join(","),
			...params,
		},
	});
}
