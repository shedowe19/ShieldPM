import { IconActivity, IconChartBar, IconDatabase, IconServer } from "@tabler/icons-react";
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
import { AnalyticsMap } from "./AnalyticsMap";
import { AnalyticsRecentRequests } from "./AnalyticsRecentRequests";
import { AnalyticsTopLists } from "./AnalyticsTopLists";

const canPoll = () =>
	isPollingAllowed({ isDocumentVisible: document.visibilityState === "visible", isOnline: navigator.onLine });

const formatBytes = (bytes: number, decimals = 2) => {
	if (!bytes) return "0 B";
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
};

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
		const fetchLiveParams = async () => {
			if (liveRequestInFlight !== undefined) return;
			const requestId = ++latestRequestId;
			liveRequestInFlight = requestId;
			try {
				try {
					const data = await getAnalyticsStatus();
					if (cancelled || requestId !== latestRequestId) return;
					setNetworkSpeed(data.totalSec || 0);
				} catch (_err) {
					// quiet failure
				}

				if (cancelled || requestId !== latestRequestId) return;

				// Fetch DB stats
				try {
					const data = await getDbStats();
					if (cancelled || requestId !== latestRequestId) return;
					setDbStats(data);
				} catch (_err) {
					// quiet failure
				}
			} finally {
				if (liveRequestInFlight === requestId) {
					liveRequestInFlight = undefined;
				}
			}
		};

		const fetchIfEligible = () => {
			if (canPoll()) {
				fetchLiveParams();
			}
		};
		const cancelPendingRequest = () => {
			latestRequestId += 1;
			liveRequestInFlight = undefined;
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
		const liveInterval = setInterval(fetchIfEligible, 2000);
		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			cancelled = true;
			liveRequestInFlight = undefined;
			clearInterval(liveInterval);
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

	const count = Number(summary?.count) || 0;
	const s2xx = Number(summary?.status2xx) || 0;
	const successRate = count > 0 ? ((s2xx / count) * 100).toFixed(1) : "0";

	// Map scale

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

			{/* KPI Cards */}
			<div className="grid gap-4 md:grid-cols-4">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							<T id="analytics.total-requests" />
						</CardTitle>
						<IconActivity className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{summary?.count?.toLocaleString()}</div>
						<p className="text-xs text-muted-foreground">
							<T id="analytics.since-service-start" />
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							<T id="analytics.success-rate" />
						</CardTitle>
						<div className="h-4 w-4 rounded-full border border-green-500 bg-green-500/20" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{successRate}%</div>
						<p className="text-xs text-muted-foreground">
							<T id="analytics.responses" data={{ count: s2xx }} />
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							<T id="analytics.bandwidth-live" />
						</CardTitle>
						<IconChartBar className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{formatBytes(networkSpeed)}/s</div>
						<p className="text-xs text-muted-foreground">
							<T id="analytics.current-throughput" />
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">
							<T id="analytics.database" />
						</CardTitle>
						<IconDatabase className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{formatBytes(dbStats?.size || 0)}</div>
						<p className="text-xs text-muted-foreground">
							{dbStats?.engine?.toUpperCase()} • {dbStats?.connections?.open || 1}{" "}
							<T id="analytics.connections" />
						</p>
						<p className="text-xs text-muted-foreground mt-1">
							<T id="analytics.io-reads" />: {(dbStats?.io?.reads || 0).toLocaleString()} •{" "}
							<T id="analytics.io-writes" />: {(dbStats?.io?.writes || 0).toLocaleString()}
						</p>
					</CardContent>
				</Card>
			</div>

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
