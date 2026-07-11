import type { AnalyticsSummary } from "src/api/backend";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { T } from "src/locale";

interface Props {
	isDemo?: boolean;
	summary: AnalyticsSummary | null;
}

export const AnalyticsTopLists = ({ isDemo = false, summary }: Props) => (
	<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
		<Card>
			<CardHeader>
				<CardTitle>
					<T id="analytics.top-ips" />
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-3">
					{summary?.topIps && summary.topIps.length > 0 ? (
						summary.topIps.map((item, index) => (
							<div key={index} className="flex justify-between text-xs items-center">
								<span
									className="truncate flex-1 min-w-0 mr-2 font-mono"
									title={isDemo ? "Hidden IP" : item.ip}
								>
									{isDemo ? "Hidden IP" : item.ip}
								</span>
								<span className="text-muted-foreground whitespace-nowrap">{item.count}</span>
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
		<Card>
			<CardHeader>
				<CardTitle>
					<T id="analytics.top-referrers" />
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-3">
					{summary?.topReferers && summary.topReferers.length > 0 ? (
						summary.topReferers.map((item, index) => (
							<div key={index} className="flex justify-between text-xs items-center">
								<span className="truncate flex-1 min-w-0 mr-2" title={item.referer}>
									{item.referer}
								</span>
								<span className="text-muted-foreground whitespace-nowrap">{item.count}</span>
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
		<Card>
			<CardHeader>
				<CardTitle>
					<T id="analytics.top-paths" />
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-3">
					{summary?.topPaths && summary.topPaths.length > 0 ? (
						summary.topPaths.map((item, index) => (
							<div key={index} className="flex justify-between text-xs items-center">
								<span className="truncate flex-1 min-w-0 mr-2" title={item.path}>
									{item.path}
								</span>
								<span className="text-muted-foreground whitespace-nowrap">{item.count}</span>
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
		<Card>
			<CardHeader>
				<CardTitle>
					<T id="analytics.top-user-agents" />
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="space-y-3">
					{summary?.topUserAgents && summary.topUserAgents.length > 0 ? (
						summary.topUserAgents.map((item, index) => (
							<div key={index} className="flex justify-between text-xs items-center">
								<span className="truncate flex-1 min-w-0 mr-2" title={item.userAgent}>
									{item.userAgent}
								</span>
								<span className="text-muted-foreground whitespace-nowrap">{item.count}</span>
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
);
