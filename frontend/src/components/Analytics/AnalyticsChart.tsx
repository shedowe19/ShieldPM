import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Legend,
	ResponsiveContainer,
	Tooltip,
	XAxis,
	YAxis,
} from "recharts";
import { useTheme } from "../../hooks/useTheme";
import { T } from "../../locale";

interface Props {
	data: any[];
}

export const AnalyticsChart = ({ data }: Props) => {
	const { theme } = useTheme();
	const isDark = theme === "dark";

	return (
		<div className="flex flex-col gap-4">
			<div className="rounded-md border p-4 bg-muted/20">
				<h3 className="mb-2 text-center text-lg font-bold">
					<T id="analytics.requests-traffic" />
				</h3>
				<div className="h-[300px] w-full">
					<ResponsiveContainer width="100%" height="100%">
						<AreaChart data={data}>
							<CartesianGrid strokeDasharray="3 3" opacity={0.2} />
							<XAxis
								dataKey="time_bucket"
								tickFormatter={(val) => new Date(val * 1000).toLocaleTimeString()}
								minTickGap={30}
							/>
							<YAxis yAxisId="left" />
							<YAxis
								yAxisId="right"
								orientation="right"
								tickFormatter={(val) => `${(val / 1024 / 1024).toFixed(1)} MB`}
							/>
							<Tooltip
								labelFormatter={(label) => new Date(label * 1000).toLocaleString()}
								contentStyle={{
									backgroundColor: isDark ? "#1f2937" : "#ffffff",
									borderColor: isDark ? "#374151" : "#e5e7eb",
								}}
							/>
							<Legend />
							<Area
								yAxisId="left"
								type="monotone"
								dataKey="hits"
								name="Requests"
								stroke="#2563eb"
								fill="#3b82f6"
								fillOpacity={0.3}
							/>
							<Area
								yAxisId="right"
								type="monotone"
								dataKey="bytes"
								name="Traffic (MB)"
								stroke="#16a34a"
								fill="#22c55e"
								fillOpacity={0.3}
							/>
						</AreaChart>
					</ResponsiveContainer>
				</div>
			</div>

			<div className="rounded-md border p-4 bg-muted/20">
				<h3 className="mb-2 text-center text-lg font-bold">
					<T id="analytics.status-codes" />
				</h3>
				<div className="h-[300px] w-full">
					<ResponsiveContainer width="100%" height="100%">
						<BarChart data={data}>
							<CartesianGrid strokeDasharray="3 3" opacity={0.2} />
							<XAxis
								dataKey="time_bucket"
								tickFormatter={(val) => new Date(val * 1000).toLocaleTimeString()}
								minTickGap={30}
							/>
							<YAxis />
							<Tooltip
								labelFormatter={(label) => new Date(label * 1000).toLocaleString()}
								cursor={{ fill: "transparent" }}
								contentStyle={{
									backgroundColor: isDark ? "#1f2937" : "#ffffff",
									borderColor: isDark ? "#374151" : "#e5e7eb",
								}}
							/>
							<Legend />
							<Bar dataKey="status_2xx" name="2xx (OK)" stackId="a" fill="#22c55e" />
							<Bar dataKey="status_3xx" name="3xx (Redir)" stackId="a" fill="#3b82f6" />
							<Bar dataKey="status_4xx" name="4xx (Err)" stackId="a" fill="#eab308" />
							<Bar dataKey="status_5xx" name="5xx (Fail)" stackId="a" fill="#ef4444" />
						</BarChart>
					</ResponsiveContainer>
				</div>
			</div>
		</div>
	);
};
