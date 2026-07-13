import * as api from "./base";

export interface AnalyticsTopHost {
	clientErrors: number;
	domainName: string;
	id: number;
	requests: number;
	serverErrors: number;
}

export type AnalyticsTopHostsSort = "client_errors" | "requests" | "server_errors";

interface AnalyticsTopHostResponse extends Omit<AnalyticsTopHost, "clientErrors" | "domainName" | "serverErrors"> {
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
		clientErrors: host.clientErrors ?? host.client_errors ?? 0,
		domainName: host.domainName ?? host.domain_name ?? "",
		id: host.id,
		requests: host.requests,
		serverErrors: host.serverErrors ?? host.server_errors ?? 0,
	}));
}
