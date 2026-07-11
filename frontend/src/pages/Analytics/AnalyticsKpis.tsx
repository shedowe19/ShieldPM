import { IconActivity, IconChartBar, IconDatabase } from "@tabler/icons-react";
import type { AnalyticsSummary, DbStats } from "src/api/backend";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { T } from "src/locale";

interface Props {
	dbStats: DbStats | null;
	networkSpeed: number;
	summary: AnalyticsSummary | null;
}

const formatBytes = (bytes: number, decimals = 2) => {
	if (!bytes) return "0 B";
	const k = 1024;
	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ["B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`;
};

export const AnalyticsKpis = ({ dbStats, networkSpeed, summary }: Props) => {
	const count = Number(summary?.count) || 0;
	const s2xx = Number(summary?.status2xx) || 0;
	const successRate = count > 0 ? ((s2xx / count) * 100).toFixed(1) : "0";

	return (
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
	);
};
