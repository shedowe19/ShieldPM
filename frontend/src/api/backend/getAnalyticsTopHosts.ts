import * as api from "./base";

export interface AnalyticsTopHost {
	domainName: string;
	id: number;
	requests: number;
}

interface AnalyticsTopHostResponse extends Omit<AnalyticsTopHost, "domainName"> {
	domainName?: string;
	domain_name?: string;
}

export async function getAnalyticsTopHosts(): Promise<AnalyticsTopHost[]> {
	const hosts = await api.get<AnalyticsTopHostResponse[]>({ url: "/analytics/top-hosts" });
	return hosts.map((host) => ({
		domainName: host.domainName ?? host.domain_name ?? "",
		id: host.id,
		requests: host.requests,
	}));
}
