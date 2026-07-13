import { IconAlertTriangle, IconChartBar } from "@tabler/icons-react";
import { FormattedNumber } from "react-intl";
import { Link } from "react-router-dom";
import type { AnalyticsTopHostsSort } from "src/api/backend";
import { HasPermission } from "src/components/HasPermission";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { useAnalyticsTopHosts } from "src/hooks/useAnalyticsTopHosts";
import { T } from "src/locale";
import { ANALYTICS, VIEW } from "src/modules/Permissions";

type TopHostsWidgetProps = {
	sort?: AnalyticsTopHostsSort;
};

const TopHostsContent = ({ sort = "requests" }: Required<TopHostsWidgetProps>) => {
	const isServerErrorRanking = sort === "server_errors";
	const { data: hosts, isLoading } = useAnalyticsTopHosts(sort);

	if (isLoading) {
		return null;
	}

	return (
		<Card
			className={isServerErrorRanking ? "h-full border-red-500/50" : "h-full border-blue-500/50"}
			data-testid={isServerErrorRanking ? "dashboard-top-server-errors" : "dashboard-top-hosts"}
		>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-xl font-bold flex items-center gap-2">
					{isServerErrorRanking ? (
						<IconAlertTriangle className="h-5 w-5 text-red-500" />
					) : (
						<IconChartBar className="h-5 w-5 text-blue-500" />
					)}
					<T id={isServerErrorRanking ? "dashboard.top-server-errors" : "dashboard.top-hosts"} />
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-4">
				{hosts && hosts.length > 0 ? (
					<ol className="space-y-3">
						{hosts.map((host) => (
							<li key={host.id} className="flex items-center justify-between gap-4">
								<Link
									className="min-w-0 truncate text-sm font-medium hover:underline"
									to={`/analytics?host=${host.id}&range=24h`}
								>
									{host.domainName}
								</Link>
								<span
									className={
										isServerErrorRanking
											? "shrink-0 text-sm font-medium text-red-500"
											: "shrink-0 text-sm text-muted-foreground"
									}
								>
									<FormattedNumber value={isServerErrorRanking ? host.serverErrors : host.requests} />
								</span>
							</li>
						))}
					</ol>
				) : (
					<div className="text-sm text-muted-foreground text-center p-4">
						<T id="analytics.no-data-list" />
					</div>
				)}
			</CardContent>
		</Card>
	);
};

export const TopHostsWidget = ({ sort }: TopHostsWidgetProps) => (
	<HasPermission section={ANALYTICS} permission={VIEW} hideError>
		<TopHostsContent sort={sort ?? "requests"} />
	</HasPermission>
);
