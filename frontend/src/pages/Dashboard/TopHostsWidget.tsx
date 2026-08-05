import { IconAlertTriangle, IconChartBar, IconClock } from "@tabler/icons-react";
import { FormattedNumber } from "react-intl";
import { Link } from "react-router";
import type { AnalyticsTopHostsSort } from "src/api/backend";
import { HasPermission } from "src/components/HasPermission";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { useAnalyticsTopHosts } from "src/hooks/useAnalyticsTopHosts";
import { T } from "src/locale";
import { ANALYTICS, VIEW } from "src/modules/Permissions";

type TopHostsWidgetProps = {
	sort?: AnalyticsTopHostsSort;
};

const byteUnits = ["byte", "kilobyte", "megabyte", "gigabyte", "terabyte"] as const;
const bytesPerUnit = 1000;

const getByteDisplay = (bytes: number) => {
	const unitIndex =
		bytes < bytesPerUnit ? 0 : Math.min(Math.floor(Math.log(bytes) / Math.log(bytesPerUnit)), byteUnits.length - 1);
	return { unit: byteUnits[unitIndex], value: bytes / bytesPerUnit ** unitIndex };
};

const TopHostsContent = ({ sort = "requests" }: Required<TopHostsWidgetProps>) => {
	const isBandwidthRanking = sort === "bytes";
	const isClientErrorRanking = sort === "client_errors";
	const isResponseTimeRanking = sort === "response_time";
	const isServerErrorRanking = sort === "server_errors";
	const isErrorRanking = isClientErrorRanking || isServerErrorRanking;
	const { data: hosts, isLoading } = useAnalyticsTopHosts(sort);

	if (isLoading) {
		return null;
	}

	return (
		<Card
			className={
				isServerErrorRanking
					? "h-full border-red-500/50"
					: isClientErrorRanking
						? "h-full border-amber-500/50"
						: isResponseTimeRanking
							? "h-full border-violet-500/50"
							: isBandwidthRanking
								? "h-full border-cyan-500/50"
								: "h-full border-blue-500/50"
			}
			data-testid={
				isServerErrorRanking
					? "dashboard-top-server-errors"
					: isClientErrorRanking
						? "dashboard-top-client-errors"
						: isResponseTimeRanking
							? "dashboard-top-response-time"
							: isBandwidthRanking
								? "dashboard-top-bandwidth"
								: "dashboard-top-hosts"
			}
		>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-xl font-bold flex items-center gap-2">
					{isErrorRanking ? (
						<IconAlertTriangle className="h-5 w-5 text-red-500" />
					) : isResponseTimeRanking ? (
						<IconClock className="h-5 w-5 text-violet-500" />
					) : (
						<IconChartBar
							className={isBandwidthRanking ? "h-5 w-5 text-cyan-500" : "h-5 w-5 text-blue-500"}
						/>
					)}
					<T
						id={
							isServerErrorRanking
								? "dashboard.top-server-errors"
								: isClientErrorRanking
									? "dashboard.top-client-errors"
									: isResponseTimeRanking
										? "dashboard.top-response-time"
										: isBandwidthRanking
											? "dashboard.top-bandwidth"
											: "dashboard.top-hosts"
						}
					/>
				</CardTitle>
			</CardHeader>
			<CardContent className="pt-4">
				{hosts && hosts.length > 0 ? (
					<ol className="space-y-3">
						{hosts.map((host) => {
							const byteDisplay = isBandwidthRanking ? getByteDisplay(host.bytes) : null;
							const averageDuration = host.averageDuration ?? 0;

							return (
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
												: isClientErrorRanking
													? "shrink-0 text-sm font-medium text-amber-500"
													: isResponseTimeRanking
														? "shrink-0 text-sm font-medium text-violet-500"
														: isBandwidthRanking
															? "shrink-0 text-sm font-medium text-cyan-500"
															: "shrink-0 text-sm text-muted-foreground"
										}
									>
										{byteDisplay ? (
											<FormattedNumber
												maximumFractionDigits={1}
												style="unit"
												unit={byteDisplay.unit}
												unitDisplay="short"
												value={byteDisplay.value}
											/>
										) : isResponseTimeRanking ? (
											<FormattedNumber
												maximumFractionDigits={1}
												style="unit"
												unit="millisecond"
												unitDisplay="short"
												value={averageDuration}
											/>
										) : (
											<FormattedNumber
												value={
													isServerErrorRanking
														? host.serverErrors
														: isClientErrorRanking
															? host.clientErrors
															: host.requests
												}
											/>
										)}
									</span>
								</li>
							);
						})}
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
