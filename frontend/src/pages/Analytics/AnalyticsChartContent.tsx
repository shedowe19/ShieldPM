import { IconActivity, IconChartBar } from "@tabler/icons-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { TimeSeriesPoint } from "src/api/backend";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { T } from "src/locale";

interface Props {
	series: (TimeSeriesPoint & { timeDisplay: string })[];
}

const AnalyticsChartContent = ({ series }: Props) => (
	<>
		<Card className="col-span-4">
			<CardHeader>
				<CardTitle>
					<T id="analytics.requests-over-time" />
				</CardTitle>
			</CardHeader>
			<CardContent className="pl-2">
				<div className="h-[350px] flex items-center justify-center">
					{series.length > 0 ? (
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
					) : (
						<div className="text-muted-foreground flex flex-col items-center">
							<IconActivity className="h-10 w-10 mb-2 opacity-50" />
							<T id="analytics.no-data" />
						</div>
					)}
				</div>
			</CardContent>
		</Card>

		<Card className="col-span-3">
			<CardHeader>
				<CardTitle>
					<T id="analytics.status-codes" />
				</CardTitle>
			</CardHeader>
			<CardContent>
				<div className="h-[350px] flex items-center justify-center">
					{series.length > 0 ? (
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
					) : (
						<div className="text-muted-foreground flex flex-col items-center">
							<IconChartBar className="h-10 w-10 mb-2 opacity-50" />
							<T id="analytics.no-data" />
						</div>
					)}
				</div>
			</CardContent>
		</Card>
	</>
);

export default AnalyticsChartContent;
