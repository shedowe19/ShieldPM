import { IconActivity, IconChartBar, IconDatabase, IconServer } from "@tabler/icons-react";
import dayjs from "dayjs";
import { lazy, Suspense, useEffect, useState } from "react";
import { useAnalyticsDashboard } from "src/features/analytics/useAnalyticsDashboard";
import { Loading } from "src/components";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { useHealth, usePageVisibility, useProxyHosts } from "src/hooks";
import { T } from "src/locale";

const AnalyticsVisuals = lazy(() => import("src/features/analytics/AnalyticsVisuals").then((module) => ({ default: module.AnalyticsVisuals })));

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
	const health = useHealth();
	const isDemo = health.data?.demo;
	const isVisible = usePageVisibility();
	const hostId = selectedHostId ? Number.parseInt(selectedHostId, 10) : undefined;
	const { summary, series, networkSpeed, dbStats, isLoading, isFetching } = useAnalyticsDashboard(
		hostId,
		range,
		Boolean(hostId) && isVisible,
	);

	useEffect(() => {
		if (hosts?.length && !selectedHostId) {
			setSelectedHostId(String(hosts[0].id));
		}
	}, [hosts, selectedHostId]);

	if ((isLoading && !summary) || hostsLoading) {
		return (
			<div className="p-8 text-center">
				<Loading />
			</div>
		);
	}

	const count = Number(summary?.count) || 0;
	const s2xx = Number(summary?.status2xx) || 0;
	const successRate = count > 0 ? ((s2xx / count) * 100).toFixed(1) : "0";

	return (
		<div className="p-4 md:p-8 pt-6 space-y-6">
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<h2 className="text-3xl font-bold tracking-tight"><T id="analytics.title" /></h2>
					<p className="text-muted-foreground flex items-center gap-2">
						<T id="analytics.traffic-overview" tData={{ range: `analytics.range.${range}` }} />
						{isFetching ? <span className="text-xs opacity-70">• syncing</span> : null}
					</p>
				</div>
				<div className="flex items-center space-x-2">
					<Select value={selectedHostId} onValueChange={setSelectedHostId}>
						<SelectTrigger className="w-[200px]"><IconServer className="mr-2 h-4 w-4 text-muted-foreground" /><SelectValue placeholder="Select Host" /></SelectTrigger>
						<SelectContent>{hosts?.map((host) => <SelectItem key={host.id} value={String(host.id)}>{host.domainNames[0]}</SelectItem>)}</SelectContent>
					</Select>
					<div className="flex bg-muted rounded-md p-1">{["1h", "24h", "7d", "30d"].map((r) => <Button key={r} variant={range === r ? "default" : "ghost"} onClick={() => setRange(r)} size="sm" className="h-8"><T id={`analytics.range.${r}`} /></Button>)}</div>
				</div>
			</div>

			<div className="grid gap-4 md:grid-cols-4">
				<Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium"><T id="analytics.total-requests" /></CardTitle><IconActivity className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{summary?.count?.toLocaleString()}</div><p className="text-xs text-muted-foreground"><T id="analytics.since-service-start" /></p></CardContent></Card>
				<Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium"><T id="analytics.success-rate" /></CardTitle><div className="h-4 w-4 rounded-full border border-green-500 bg-green-500/20" /></CardHeader><CardContent><div className="text-2xl font-bold">{successRate}%</div><p className="text-xs text-muted-foreground"><T id="analytics.responses" data={{ count: s2xx }} /></p></CardContent></Card>
				<Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium"><T id="analytics.bandwidth-live" /></CardTitle><IconChartBar className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{formatBytes(networkSpeed)}/s</div><p className="text-xs text-muted-foreground"><T id="analytics.current-throughput" /></p></CardContent></Card>
				<Card><CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2"><CardTitle className="text-sm font-medium"><T id="analytics.database" /></CardTitle><IconDatabase className="h-4 w-4 text-muted-foreground" /></CardHeader><CardContent><div className="text-2xl font-bold">{formatBytes(dbStats?.size || 0)}</div><p className="text-xs text-muted-foreground">{dbStats?.engine?.toUpperCase()} • {dbStats?.connections?.open || 1} <T id="analytics.connections" /></p><p className="text-xs text-muted-foreground mt-1"><T id="analytics.io-reads" />: {(dbStats?.io?.reads || 0).toLocaleString()} • <T id="analytics.io-writes" />: {(dbStats?.io?.writes || 0).toLocaleString()}</p></CardContent></Card>
			</div>

			<Suspense fallback={<div className="p-8 text-center"><Loading /></div>}>
				<AnalyticsVisuals summary={summary} series={series} />
			</Suspense>

			<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
				<Card><CardHeader><CardTitle><T id="analytics.top-ips" /></CardTitle></CardHeader><CardContent><div className="space-y-3">{summary?.topIps && summary.topIps.length > 0 ? summary.topIps.map((i, idx) => (<div key={idx} className="flex justify-between text-xs items-center"><span className="truncate flex-1 min-w-0 mr-2 font-mono" title={isDemo ? "Hidden IP" : i.ip}>{isDemo ? "Hidden IP" : i.ip}</span><span className="text-muted-foreground whitespace-nowrap">{i.count}</span></div>)) : <div className="text-sm text-muted-foreground text-center p-4"><T id="analytics.no-data-list" /></div>}</div></CardContent></Card>
				<Card><CardHeader><CardTitle><T id="analytics.top-referrers" /></CardTitle></CardHeader><CardContent><div className="space-y-3">{summary?.topReferers && summary.topReferers.length > 0 ? summary.topReferers.map((r, idx) => (<div key={idx} className="flex justify-between text-xs items-center"><span className="truncate flex-1 min-w-0 mr-2" title={r.referer}>{r.referer}</span><span className="text-muted-foreground whitespace-nowrap">{r.count}</span></div>)) : <div className="text-sm text-muted-foreground text-center p-4"><T id="analytics.no-data-list" /></div>}</div></CardContent></Card>
				<Card><CardHeader><CardTitle><T id="analytics.top-paths" /></CardTitle></CardHeader><CardContent><div className="space-y-3">{summary?.topPaths && summary.topPaths.length > 0 ? summary.topPaths.map((p, idx) => (<div key={idx} className="flex justify-between text-xs items-center"><span className="truncate flex-1 min-w-0 mr-2" title={p.path}>{p.path}</span><span className="text-muted-foreground whitespace-nowrap">{p.count}</span></div>)) : <div className="text-sm text-muted-foreground text-center p-4"><T id="analytics.no-data-list" /></div>}</div></CardContent></Card>
				<Card><CardHeader><CardTitle><T id="analytics.top-user-agents" /></CardTitle></CardHeader><CardContent><div className="space-y-3">{summary?.topUserAgents && summary.topUserAgents.length > 0 ? summary.topUserAgents.map((u, idx) => (<div key={idx} className="flex justify-between text-xs items-center"><span className="truncate flex-1 min-w-0 mr-2" title={u.userAgent}>{u.userAgent}</span><span className="text-muted-foreground whitespace-nowrap">{u.count}</span></div>)) : <div className="text-sm text-muted-foreground text-center p-4"><T id="analytics.no-data-list" /></div>}</div></CardContent></Card>
			</div>

			<Card>
				<CardHeader><CardTitle><T id="analytics.recent-requests" /></CardTitle></CardHeader>
				<CardContent>
					{summary?.recentRequests && summary.recentRequests.length > 0 ? (
						<div className="relative w-full overflow-auto"><table className="w-full caption-bottom text-sm text-left"><thead className="[&_tr]:border-b"><tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"><th className="h-12 px-4 align-middle font-medium text-muted-foreground">Time</th><th className="h-12 px-4 align-middle font-medium text-muted-foreground">Method</th><th className="h-12 px-4 align-middle font-medium text-muted-foreground">Status</th><th className="h-12 px-4 align-middle font-medium text-muted-foreground">Path</th><th className="h-12 px-4 align-middle font-medium text-muted-foreground">IP</th><th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">Duration</th></tr></thead><tbody className="[&_tr:last-child]:border-0">{summary.recentRequests.map((req, idx) => (<tr key={idx} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"><td className="p-4 align-middle">{dayjs(req.time).format("HH:mm:ss")}</td><td className="p-4 align-middle font-mono">{req.method}</td><td className="p-4 align-middle"><span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${req.status >= 200 && req.status < 300 ? "text-green-500" : req.status >= 300 && req.status < 400 ? "text-blue-500" : req.status >= 400 && req.status < 500 ? "text-yellow-500" : "text-red-500"}`}>{req.status}</span></td><td className="p-4 align-middle break-all max-w-[300px]">{req.path}</td><td className="p-4 align-middle font-mono">{isDemo ? "Hidden IP" : req.ip} {req.countryCode ? `(${req.countryCode})` : ""}</td><td className="p-4 align-middle text-right">{req.duration}ms</td></tr>))}</tbody></table></div>
					) : (<div className="text-sm text-muted-foreground text-center p-4"><T id="analytics.no-data-list" /></div>)}
				</CardContent>
			</Card>
		</div>
	);
};

export default Analytics;
