import { IconChartBar } from "@tabler/icons-react";
import { FormattedNumber } from "react-intl";
import { Link } from "react-router-dom";
import { HasPermission } from "src/components/HasPermission";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { useAnalyticsTopHosts } from "src/hooks/useAnalyticsTopHosts";
import { T } from "src/locale";
import { ANALYTICS, VIEW } from "src/modules/Permissions";

const TopHostsContent = () => {
	const { data: hosts, isLoading } = useAnalyticsTopHosts();

	if (isLoading) {
		return null;
	}

	return (
		<Card className="h-full border-blue-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-xl font-bold flex items-center gap-2">
					<IconChartBar className="h-5 w-5 text-blue-500" />
					<T id="dashboard.top-hosts" />
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
								<span className="shrink-0 text-sm text-muted-foreground">
									<FormattedNumber value={host.requests} />
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

export const TopHostsWidget = () => (
	<HasPermission section={ANALYTICS} permission={VIEW} hideError>
		<TopHostsContent />
	</HasPermission>
);
