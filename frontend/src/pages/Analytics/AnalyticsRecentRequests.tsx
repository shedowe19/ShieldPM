import dayjs from "dayjs";
import type { AnalyticsSummary } from "src/api/backend";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { T } from "src/locale";

interface Props {
	isDemo?: boolean;
	summary: AnalyticsSummary | null;
}

export const AnalyticsRecentRequests = ({ isDemo = false, summary }: Props) => (
	<Card>
		<CardHeader>
			<CardTitle>
				<T id="analytics.recent-requests" />
			</CardTitle>
		</CardHeader>
		<CardContent>
			{summary?.recentRequests && summary.recentRequests.length > 0 ? (
				<div className="relative w-full overflow-auto">
					<table className="w-full caption-bottom text-sm text-left">
						<thead className="[&_tr]:border-b">
							<tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
								<th className="h-12 px-4 align-middle font-medium text-muted-foreground">
									<T id="analytics.table.time" />
								</th>
								<th className="h-12 px-4 align-middle font-medium text-muted-foreground">
									<T id="analytics.table.method" />
								</th>
								<th className="h-12 px-4 align-middle font-medium text-muted-foreground">
									<T id="analytics.table.status" />
								</th>
								<th className="h-12 px-4 align-middle font-medium text-muted-foreground">
									<T id="analytics.table.path" />
								</th>
								<th className="h-12 px-4 align-middle font-medium text-muted-foreground">
									<T id="analytics.table.ip-address" />
								</th>
								<th className="h-12 px-4 align-middle font-medium text-muted-foreground text-right">
									<T id="analytics.table.duration" />
								</th>
							</tr>
						</thead>
						<tbody className="[&_tr:last-child]:border-0">
							{summary.recentRequests.map((req, index) => (
								<tr
									key={index}
									className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted"
								>
									<td className="p-4 align-middle">{dayjs(req.time).format("HH:mm:ss")}</td>
									<td className="p-4 align-middle font-mono">{req.method}</td>
									<td className="p-4 align-middle">
										<span
											className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold
											${
												req.status >= 200 && req.status < 300
													? "text-green-500"
													: req.status >= 300 && req.status < 400
														? "text-blue-500"
														: req.status >= 400 && req.status < 500
															? "text-yellow-500"
															: "text-red-500"
											}`}
										>
											{req.status}
										</span>
									</td>
									<td className="p-4 align-middle break-all max-w-[300px]">{req.path}</td>
									<td className="p-4 align-middle font-mono">
										{isDemo ? "Hidden IP" : req.ip} {req.countryCode ? `(${req.countryCode})` : ""}
									</td>
									<td className="p-4 align-middle text-right">{req.duration}ms</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			) : (
				<div className="text-sm text-muted-foreground text-center p-4">
					<T id="analytics.no-data-list" />
				</div>
			)}
		</CardContent>
	</Card>
);
