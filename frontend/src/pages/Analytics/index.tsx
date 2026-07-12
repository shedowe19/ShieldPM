import { useEffect, useState } from "react";
import { Loading } from "src/components";
import { useHealth, useProxyHosts } from "src/hooks";
import { T } from "src/locale";
import { AnalyticsCharts } from "./AnalyticsCharts";
import { AnalyticsFilters } from "./AnalyticsFilters";
import { AnalyticsGeography } from "./AnalyticsGeography";
import { AnalyticsKpis } from "./AnalyticsKpis";
import { AnalyticsRecentRequests } from "./AnalyticsRecentRequests";
import { AnalyticsTopLists } from "./AnalyticsTopLists";
import { useAnalyticsData } from "./useAnalyticsData";
import { useAnalyticsLiveMetrics } from "./useAnalyticsLiveMetrics";

const Analytics = () => {
	const { data: hosts, isLoading: hostsLoading } = useProxyHosts();
	const [selectedHostId, setSelectedHostId] = useState<string>("");
	const [range, setRange] = useState("24h");
	const health = useHealth();
	const isDemo = health.data?.demo;
	const { loading, series, summary } = useAnalyticsData(selectedHostId, range);
	const { dbStats, networkSpeed } = useAnalyticsLiveMetrics();

	// Select first host by default
	useEffect(() => {
		if (hosts?.length && !selectedHostId) {
			setSelectedHostId(String(hosts[0].id));
		}
	}, [hosts, selectedHostId]);

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
					onRangeChange={setRange}
					onSelectedHostIdChange={setSelectedHostId}
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
