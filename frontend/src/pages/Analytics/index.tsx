import { IconServer } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import {
	type AnalyticsSummary,
	type DbStats,
	getAnalyticsSeries,
	getAnalyticsSummary,
	getDbStats,
	type TimeSeriesPoint,
} from "src/api/backend";
import { getAnalyticsStatus } from "src/api/backend/getAnalyticsStatus";
import { Loading } from "src/components";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { useHealth, useProxyHosts } from "src/hooks";
import { getPollingInterval, isPollingAllowed } from "src/hooks/pollingPolicy";
import { intl, T } from "src/locale";
import { AnalyticsCharts } from "./AnalyticsCharts";
import { AnalyticsKpis } from "./AnalyticsKpis";
import { AnalyticsMap } from "./AnalyticsMap";
import { AnalyticsRecentRequests } from "./AnalyticsRecentRequests";
import { AnalyticsTopLists } from "./AnalyticsTopLists";

const canPoll = () =>
	isPollingAllowed({ isDocumentVisible: document.visibilityState === "visible", isOnline: navigator.onLine });

const Analytics = () => {
	const { data: hosts, isLoading: hostsLoading } = useProxyHosts();
	const [selectedHostId, setSelectedHostId] = useState<string>("");
	const [range, setRange] = useState("24h");
	const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
	const [series, setSeries] = useState<(TimeSeriesPoint & { timeDisplay: string })[]>([]);
	const [loading, setLoading] = useState(false);
	const [networkSpeed, setNetworkSpeed] = useState(0);
	const [dbStats, setDbStats] = useState<DbStats | null>(null);
	const health = useHealth();
	const isDemo = health.data?.demo;

	// Select first host by default
	useEffect(() => {
		if (hosts?.length && !selectedHostId) {
			setSelectedHostId(String(hosts[0].id));
		}
	}, [hosts, selectedHostId]);

	useEffect(() => {
		let cancelled = false;
		let latestRequestId = 0;
		let timeout: ReturnType<typeof setTimeout> | undefined;

		const clearScheduledFetch = () => {
			if (timeout !== undefined) {
				clearTimeout(timeout);
				timeout = undefined;
			}
		};

		const fetchData = async (): Promise<boolean | undefined> => {
			if (!selectedHostId) return undefined;
			const requestId = ++latestRequestId;
			setLoading(true);
			try {
				const hostId = Number.parseInt(selectedHostId, 10);
				// Fetch Summary
				const summaryData = await getAnalyticsSummary(hostId, range);
				if (cancelled || requestId !== latestRequestId) return undefined;
				setSummary(summaryData);

				// Fetch Series
				const seriesData = await getAnalyticsSeries(hostId, range);
				if (cancelled || requestId !== latestRequestId) return undefined;
				// Format timestamp for chart
				const formattedSeries = seriesData.map((d) => ({
					...d,
					timeDisplay: dayjs(d.timestamp).format("HH:mm"),
				}));
				setSeries(formattedSeries);
				return true;
			} catch (error) {
				if (!cancelled && requestId === latestRequestId) {
					console.error("Failed to fetch analytics:", error);
				}
				return false;
			} finally {
				if (!cancelled && requestId === latestRequestId) {
					setLoading(false);
				}
			}
		};

		const scheduleNextFetch = (failureCount: number) => {
			clearScheduledFetch();
			const interval = getPollingInterval({
				baseIntervalMs: 10_000,
				failureCount,
				isDocumentVisible: document.visibilityState === "visible",
				isOnline: navigator.onLine,
			});
			if (interval !== false) {
				timeout = setTimeout(() => {
					void fetchAndSchedule(failureCount);
				}, interval);
			}
		};

		const fetchAndSchedule = async (failureCount: number) => {
			if (!canPoll()) return;
			const succeeded = await fetchData();
			if (!cancelled && succeeded !== undefined) {
				scheduleNextFetch(succeeded ? 0 : failureCount + 1);
			}
		};

		const fetchIfEligible = () => {
			clearScheduledFetch();
			if (canPoll()) void fetchAndSchedule(0);
		};
		const cancelPendingRequest = () => {
			latestRequestId += 1;
			clearScheduledFetch();
		};

		const handleVisibilityChange = () => {
			if (canPoll()) {
				fetchIfEligible();
			} else {
				cancelPendingRequest();
			}
		};
		const handleOnline = () => fetchIfEligible();
		const handleOffline = () => cancelPendingRequest();

		fetchIfEligible();

		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			cancelled = true;
			clearScheduledFetch();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, [selectedHostId, range]);

	useEffect(() => {
		let cancelled = false;
		let latestRequestId = 0;
		let liveRequestInFlight: number | undefined;
		let timeout: ReturnType<typeof setTimeout> | undefined;

		const clearScheduledFetch = () => {
			if (timeout !== undefined) {
				clearTimeout(timeout);
				timeout = undefined;
			}
		};

		const fetchLiveParams = async (): Promise<boolean | undefined> => {
			if (liveRequestInFlight !== undefined) return;
			const requestId = ++latestRequestId;
			liveRequestInFlight = requestId;
			let succeeded = true;
			try {
				try {
					const data = await getAnalyticsStatus();
					if (cancelled || requestId !== latestRequestId) return;
					setNetworkSpeed(data.totalSec || 0);
				} catch (_err) {
					// quiet failure
					succeeded = false;
				}

				if (cancelled || requestId !== latestRequestId) return;

				// Fetch DB stats
				try {
					const data = await getDbStats();
					if (cancelled || requestId !== latestRequestId) return;
					setDbStats(data);
				} catch (_err) {
					// quiet failure
					succeeded = false;
				}

				if (cancelled || requestId !== latestRequestId) return;
				return succeeded;
			} finally {
				if (liveRequestInFlight === requestId) {
					liveRequestInFlight = undefined;
				}
			}
		};

		const scheduleNextFetch = (failureCount: number) => {
			clearScheduledFetch();
			const interval = getPollingInterval({
				baseIntervalMs: 2_000,
				failureCount,
				isDocumentVisible: document.visibilityState === "visible",
				isOnline: navigator.onLine,
			});
			if (interval !== false) {
				timeout = setTimeout(() => {
					void fetchAndSchedule(failureCount);
				}, interval);
			}
		};

		const fetchAndSchedule = async (failureCount: number) => {
			if (!canPoll()) return;
			const succeeded = await fetchLiveParams();
			if (!cancelled && succeeded !== undefined) {
				scheduleNextFetch(succeeded ? 0 : failureCount + 1);
			}
		};

		const fetchIfEligible = () => {
			clearScheduledFetch();
			if (canPoll()) {
				void fetchAndSchedule(0);
			}
		};
		const cancelPendingRequest = () => {
			latestRequestId += 1;
			liveRequestInFlight = undefined;
			clearScheduledFetch();
		};

		const handleVisibilityChange = () => {
			if (canPoll()) {
				fetchLiveParams();
			} else {
				cancelPendingRequest();
			}
		};
		const handleOnline = () => fetchIfEligible();
		const handleOffline = () => cancelPendingRequest();

		fetchIfEligible();
		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			cancelled = true;
			liveRequestInFlight = undefined;
			clearScheduledFetch();
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

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
				<div className="flex items-center space-x-2">
					<Select value={selectedHostId} onValueChange={setSelectedHostId}>
						<SelectTrigger className="w-[200px]">
							<IconServer className="mr-2 h-4 w-4 text-muted-foreground" />
							<SelectValue placeholder={intl.formatMessage({ id: "analytics.select-host" })} />
						</SelectTrigger>
						<SelectContent>
							{hosts?.map((host) => (
								<SelectItem key={host.id} value={String(host.id)}>
									{host.domainNames[0]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>

					<div className="flex bg-muted rounded-md p-1">
						{["1h", "24h", "7d", "30d"].map((r) => (
							<Button
								key={r}
								variant={range === r ? "default" : "ghost"}
								onClick={() => setRange(r)}
								size="sm"
								className="h-8"
							>
								<T id={`analytics.range.${r}`} />
							</Button>
						))}
					</div>
				</div>
			</div>

			<AnalyticsKpis dbStats={dbStats} networkSpeed={networkSpeed} summary={summary} />

			{/* Charts */}
			<AnalyticsCharts series={series} />

			{/* Map & Tables */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				{/* World Map */}
				<Card className="overflow-hidden">
					<CardHeader>
						<CardTitle>
							<T id="analytics.requests-by-country" />
						</CardTitle>
					</CardHeader>
					<CardContent className="p-0">
						<AnalyticsMap summary={summary} />
					</CardContent>
				</Card>

				{/* Top Countries List */}
				<Card>
					<CardHeader>
						<CardTitle>
							<T id="analytics.top-countries" />
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{summary?.topCountries && summary.topCountries.length > 0 ? (
								summary.topCountries.slice(0, 10).map((c) => (
									<div key={c.countryCode} className="flex justify-between text-sm items-center">
										<div className="flex items-center gap-2">
											<span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">
												{c.countryCode || "??"}
											</span>
										</div>
										<div className="flex items-center gap-4">
											<div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
												<div
													className="h-full bg-cyan-500"
													style={{
														width: `${(c.count / (summary?.topCountries?.[0]?.count || 1)) * 100}%`,
													}}
												/>
											</div>
											<span className="w-12 text-right">{c.count.toLocaleString()}</span>
										</div>
									</div>
								))
							) : (
								<div className="text-sm text-muted-foreground text-center p-4">
									<T id="analytics.no-data-list" />
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Top Lists */}
			<AnalyticsTopLists summary={summary} isDemo={isDemo} />

			{/* Recent Requests */}
			<AnalyticsRecentRequests summary={summary} isDemo={isDemo} />
		</div>
	);
};

export default Analytics;
