import * as api from "./base";

export interface AnalyticsTopHost {
	bytes: number;
	clientErrors: number;
	domainName: string;
	id: number;
	requests: number;
	serverErrors: number;
}

export type AnalyticsTopHostsSort = "bytes" | "client_errors" | "requests" | "server_errors";

interface AnalyticsTopHostResponse
	extends Omit<AnalyticsTopHost, "bytes" | "clientErrors" | "domainName" | "serverErrors"> {
	bytes?: number | string;
	clientErrors?: number;
	client_errors?: number;
	domainName?: string;
	domain_name?: string;
	serverErrors?: number;
	server_errors?: number;
}

export async function getAnalyticsTopHosts(sort: AnalyticsTopHostsSort = "requests"): Promise<AnalyticsTopHost[]> {
	const hosts = await api.get<AnalyticsTopHostResponse[]>({
		url: "/analytics/top-hosts",
		...(sort === "requests" ? {} : { params: { sort } }),
	});
	return hosts.map((host) => ({
		bytes: Number(host.bytes) || 0,
		clientErrors: host.clientErrors ?? host.client_errors ?? 0,
		domainName: host.domainName ?? host.domain_name ?? "",
		id: host.id,
		requests: host.requests,
		serverErrors: host.serverErrors ?? host.server_errors ?? 0,
	}));
}
