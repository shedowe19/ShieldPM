import * as api from "./base";

export interface AnalyticsTopHost {
	domainName: string;
	id: number;
	requests: number;
	serverErrors: number;
}

export type AnalyticsTopHostsSort = "requests" | "server_errors";

interface AnalyticsTopHostResponse extends Omit<AnalyticsTopHost, "domainName" | "serverErrors"> {
	domainName?: string;
	domain_name?: string;
	serverErrors?: number;
	server_errors?: number;
}

export async function getAnalyticsTopHosts(sort: AnalyticsTopHostsSort = "requests"): Promise<AnalyticsTopHost[]> {
	const hosts = await api.get<AnalyticsTopHostResponse[]>({
		url: "/analytics/top-hosts",
		...(sort === "server_errors" ? { params: { sort } } : {}),
	});
	return hosts.map((host) => ({
		domainName: host.domainName ?? host.domain_name ?? "",
		id: host.id,
		requests: host.requests,
		serverErrors: host.serverErrors ?? host.server_errors ?? 0,
	}));
}
