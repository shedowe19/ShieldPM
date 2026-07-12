import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Loading } from "src/components";
import { useHealth, useProxyHosts } from "src/hooks";
import { T } from "src/locale";
import { AnalyticsCharts } from "./AnalyticsCharts";
import { AnalyticsFilters, analyticsRanges } from "./AnalyticsFilters";
import { AnalyticsGeography } from "./AnalyticsGeography";
import { AnalyticsKpis } from "./AnalyticsKpis";
import { AnalyticsRecentRequests } from "./AnalyticsRecentRequests";
import { AnalyticsTopLists } from "./AnalyticsTopLists";
import { useAnalyticsData } from "./useAnalyticsData";
import { useAnalyticsLiveMetrics } from "./useAnalyticsLiveMetrics";

const Analytics = () => {
	const { data: hosts, isLoading: hostsLoading } = useProxyHosts();
	const [searchParams, setSearchParams] = useSearchParams();
	const requestedHostId = searchParams.get("host") ?? "";
	const requestedRange = searchParams.get("range") ?? "";
	const selectedHostId = hosts?.some((host) => String(host.id) === requestedHostId) ? requestedHostId : "";
	const range = analyticsRanges.includes(requestedRange) ? requestedRange : "24h";
	const health = useHealth();
	const isDemo = health.data?.demo;
	const { loading, series, summary } = useAnalyticsData(selectedHostId, range);
	const { dbStats, networkSpeed } = useAnalyticsLiveMetrics();

	useEffect(() => {
		if (!hosts?.length) {
			return;
		}

		const nextHostId = selectedHostId || String(hosts[0].id);
		if (nextHostId === requestedHostId && range === requestedRange) {
			return;
		}

		setSearchParams(new URLSearchParams({ host: nextHostId, range }), { replace: true });
	}, [hosts, range, requestedHostId, requestedRange, selectedHostId, setSearchParams]);

	const updateSearchParams = (nextFilters: { hostId?: string; range?: string }) => {
		const hostId = nextFilters.hostId ?? selectedHostId;
		const nextRange = nextFilters.range ?? range;
		const params = new URLSearchParams();

		if (hostId) {
			params.set("host", hostId);
		}
		params.set("range", nextRange);
		setSearchParams(params, { replace: true });
	};

	if ((loading && !summary) || hostsLoading) {
		return (
			<div className="p-8 text-center">
				<Loading />
			</div>
		);
	}

	return (
		<div className="p-4 md:p-8 pt-6 space-y-6">
			{/* Page Header */}
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">
						<T id="analytics.title" />
					</h2>
					<p className="text-muted-foreground">
						<T id="analytics.traffic-overview" tData={{ range: `analytics.range.${range}` }} />
					</p>
				</div>
				<AnalyticsFilters
					hosts={hosts}
					onRangeChange={(nextRange) => updateSearchParams({ range: nextRange })}
					onSelectedHostIdChange={(hostId) => updateSearchParams({ hostId })}
					range={range}
					selectedHostId={selectedHostId}
				/>
			</div>

			<AnalyticsKpis dbStats={dbStats} networkSpeed={networkSpeed} summary={summary} />

			{/* Charts */}
			<AnalyticsCharts series={series} />

			<AnalyticsGeography summary={summary} />

			{/* Top Lists */}
			<AnalyticsTopLists summary={summary} isDemo={isDemo} />

			{/* Recent Requests */}
			<AnalyticsRecentRequests summary={summary} isDemo={isDemo} />
		</div>
	);
};

export default Analytics;
