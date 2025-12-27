import { IconActivity, IconChartBar, IconServer } from "@tabler/icons-react";
import dayjs from "dayjs";
import { useEffect, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Button } from "src/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { getAnalyticsSummary, getAnalyticsSeries, type AnalyticsSummary, type TimeSeriesPoint } from "src/api/backend";
import { useProxyHosts } from "src/hooks";
import { T } from "src/locale";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";
import { scaleLinear } from "d3-scale";
import { Loading } from "src/components";

// GeoJSON url
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

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

	// Select first host by default
	useEffect(() => {
		if (hosts?.length && !selectedHostId) {
			setSelectedHostId(String(hosts[0].id));
		}
	}, [hosts, selectedHostId]);

	useEffect(() => {
		const fetchData = async () => {
			if (!selectedHostId) return;
			setLoading(true);
			try {
				const hostId = Number.parseInt(selectedHostId);
				// Fetch Summary
				const summaryData = await getAnalyticsSummary(hostId, range);
				setSummary(summaryData);

				// Fetch Series
				const seriesData = await getAnalyticsSeries(hostId, range);
				// Format timestamp for chart
				const formattedSeries = seriesData.map((d) => ({
					...d,
					timeDisplay: dayjs(d.timestamp).format("HH:mm"),
				}));
				setSeries(formattedSeries);
			} catch (error) {
				console.error("Failed to fetch analytics:", error);
			} finally {
				setLoading(false);
			}
		};

		fetchData();

		// Refresh main data every 10 seconds
		const interval = setInterval(fetchData, 10000);
		return () => clearInterval(interval);
	}, [selectedHostId, range]);

	useEffect(() => {
		const fetchLiveParams = async () => {
			try {
				const res = await fetch("/api/analytics/status", {
					headers: {
						"Authorization": `Bearer ${localStorage.getItem("token")}`
					}
				});
				if (res.ok) {
					const data = await res.json();
					setNetworkSpeed(data.total_sec || 0);
				}
			} catch (_err) {
				// quiet failure
			}
		};

		fetchLiveParams();
		const liveInterval = setInterval(fetchLiveParams, 2000);
		return () => clearInterval(liveInterval);
	}, []);

	if ((loading && !summary) || hostsLoading) {
		return <div className="p-8 text-center"><Loading /></div>;
	}

	const count = Number(summary?.count) || 0;
	const s2xx = Number(summary?.status_2xx) || 0;
	const successRate = count > 0 ? ((s2xx / count) * 100).toFixed(1) : "0";

	// Map scale
	const maxCountryCount = summary?.top_countries?.[0]?.count || 0;
	const colorScale = scaleLinear<string>().domain([0, maxCountryCount]).range(["#EAEAEC", "#06b6d4"]);

	return (
		<div className="p-4 md:p-8 pt-6 space-y-6">
			{/* Page Header */}
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<h2 className="text-3xl font-bold tracking-tight">Analytics</h2>
					<p className="text-muted-foreground">Traffic overview for {range}.</p>
				</div>
				<div className="flex items-center space-x-2">
					<Select value={selectedHostId} onValueChange={setSelectedHostId}>
						<SelectTrigger className="w-[200px]">
							<IconServer className="mr-2 h-4 w-4 text-muted-foreground" />
							<SelectValue placeholder="Select Host" />
						</SelectTrigger>
						<SelectContent>
							{hosts?.map(host => (
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
			<div className="grid gap-4 md:grid-cols-3">
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Total Requests</CardTitle>
						<IconActivity className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{summary?.count?.toLocaleString()}</div>
						<p className="text-xs text-muted-foreground">
							+100% since service start
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Success Rate</CardTitle>
						<div className="h-4 w-4 rounded-full border border-green-500 bg-green-500/20" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{successRate}%</div>
						<p className="text-xs text-muted-foreground">2xx Responses</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="text-sm font-medium">Bandwidth (Live)</CardTitle>
						<IconChartBar className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="text-2xl font-bold">{formatBytes(networkSpeed)}/s</div>
						<p className="text-xs text-muted-foreground">Current Throughput</p>
					</CardContent>
				</Card>
			</div>

			{/* Charts */}
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
				<Card className="col-span-4">
					<CardHeader>
						<CardTitle>Requests over Time</CardTitle>
					</CardHeader>
					<CardContent className="pl-2">
						<div className="h-[350px]">
							<ResponsiveContainer width="100%" height="100%">
								<AreaChart data={series}>
									<defs>
										<linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
											<stop offset="5%" stopColor="#06b6d4" stopOpacity={0.8} />
											<stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
										</linearGradient>
									</defs>
									<XAxis
										dataKey="timeDisplay"
										stroke="#888888"
										fontSize={12}
										tickLine={false}
										axisLine={false}
										minTickGap={30}
									/>
									<YAxis
										stroke="#888888"
										fontSize={12}
										tickLine={false}
										axisLine={false}
										tickFormatter={(value) => `${value}`}
									/>
									<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
									<Tooltip
										contentStyle={{ backgroundColor: "#1f2937", border: "none" }}
										labelStyle={{ color: "#f3f4f6" }}
									/>
									<Area
										type="monotone"
										dataKey="count"
										stroke="#06b6d4"
										fillOpacity={1}
										fill="url(#colorCount)"
										strokeWidth={2}
									/>
								</AreaChart>
							</ResponsiveContainer>
						</div>
					</CardContent>
				</Card>

				<Card className="col-span-3">
					<CardHeader>
						<CardTitle>Status Codes</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-[350px]">
							<ResponsiveContainer width="100%" height="100%">
								<BarChart data={series}>
									<XAxis
										dataKey="timeDisplay"
										stroke="#888888"
										fontSize={12}
										tickLine={false}
										axisLine={false}
										minTickGap={30}
									/>
									<Tooltip
										cursor={{ fill: "transparent" }}
										contentStyle={{ backgroundColor: "#1f2937", border: "none" }}
									/>
									<Bar dataKey="s2xx" name="2xx" stackId="a" fill="#22c55e" radius={[0, 0, 4, 4]} />
									<Bar dataKey="s3xx" name="3xx" stackId="a" fill="#3b82f6" />
									<Bar dataKey="s4xx" name="4xx" stackId="a" fill="#eab308" />
									<Bar dataKey="s5xx" name="5xx" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
								</BarChart>
							</ResponsiveContainer>
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Map & Tables */}
			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				{/* World Map */}
				<Card>
					<CardHeader>
						<CardTitle>Requests by Country</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="h-[300px] w-full">
							<ComposableMap projectionConfig={{ scale: 140 }}>
								<ZoomableGroup>
									<Geographies geography={GEO_URL}>
										{({ geographies }) =>
											geographies.map((geo) => {
												const cur = summary?.top_countries?.find((s) => s.country_code === geo.properties.ISO_A2);
												return (
													<Geography
														key={geo.rsmKey}
														geography={geo}
														fill={cur ? colorScale(cur.count) : "#F5F4F6"}
														stroke="#D6D6DA"
													/>
												);
											})
										}
									</Geographies>
								</ZoomableGroup>
							</ComposableMap>
						</div>
					</CardContent>
				</Card>

				{/* Top Countries List */}
				<Card>
					<CardHeader>
						<CardTitle>Top Countries</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-4">
							{summary?.top_countries?.slice(0, 10).map((c) => (
								<div key={c.country_code} className="flex justify-between text-sm items-center">
									<div className="flex items-center gap-2">
										<span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{c.country_code || "??"}</span>
									</div>
									<div className="flex items-center gap-4">
										<div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
											<div
												className="h-full bg-cyan-500"
												style={{ width: `${(c.count / (summary?.top_countries?.[0]?.count || 1)) * 100}%` }}
											/>
										</div>
										<span className="w-12 text-right">{c.count.toLocaleString()}</span>
									</div>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>

			{/* Top Lists Row */}
			<div className="grid grid-cols-1 md:grid-cols-3 gap-6">
				<Card>
					<CardHeader>
						<CardTitle>Top IPs</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{summary?.top_ips?.map((i, idx) => (
								<div key={idx} className="flex justify-between text-xs">
									<span className="truncate max-w-[70%] font-mono">{i.ip}</span>
									<span className="text-muted-foreground">{i.count}</span>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Top Referrers</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{summary?.top_referers?.map((r, idx) => (
								<div key={idx} className="flex justify-between text-xs">
									<span className="truncate max-w-[80%]" title={r.referer}>{r.referer}</span>
									<span className="text-muted-foreground">{r.count}</span>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle>Top Paths</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="space-y-3">
							{summary?.top_paths?.map((p, idx) => (
								<div key={idx} className="flex justify-between text-xs">
									<span className="truncate max-w-[80%]" title={p.path}>{p.path}</span>
									<span className="text-muted-foreground">{p.count}</span>
								</div>
							))}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
};

export default Analytics;
