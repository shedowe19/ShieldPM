import { IconActivity, IconChartBar } from "@tabler/icons-react";
import { geoCentroid } from "d3-geo";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsSummary, TimeSeriesPoint } from "src/api/backend";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { T } from "src/locale";

countries.registerLocale(enLocale);

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";
const pulseStyle = `
@keyframes pulse {
	0% { transform: scale(1); opacity: 1; }
	50% { transform: scale(1.5); opacity: 0.5; }
	100% { transform: scale(1); opacity: 1; }
}
`;

interface Props {
	summary: AnalyticsSummary | null;
	series: (TimeSeriesPoint & { timeDisplay: string })[];
}

export const AnalyticsVisuals = ({ summary, series }: Props) => {
	return (
		<>
			<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
				<Card className="col-span-4">
					<CardHeader><CardTitle><T id="analytics.requests-over-time" /></CardTitle></CardHeader>
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
										<XAxis dataKey="timeDisplay" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} minTickGap={30} />
										<YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}`} />
										<CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
										<Tooltip contentStyle={{ backgroundColor: "#1f2937", border: "none" }} labelStyle={{ color: "#f3f4f6" }} />
										<Area type="monotone" dataKey="count" stroke="#06b6d4" fillOpacity={1} fill="url(#colorCount)" strokeWidth={2} />
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
					<CardHeader><CardTitle><T id="analytics.status-codes" /></CardTitle></CardHeader>
					<CardContent>
						<div className="h-[350px] flex items-center justify-center">
							{series.length > 0 ? (
								<ResponsiveContainer width="100%" height="100%">
									<BarChart data={series}>
										<XAxis dataKey="timeDisplay" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} minTickGap={30} />
										<Tooltip cursor={{ fill: "transparent" }} contentStyle={{ backgroundColor: "#1f2937", border: "none" }} />
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
			</div>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
				<Card className="overflow-hidden">
					<style>{pulseStyle}</style>
					<CardHeader><CardTitle><T id="analytics.requests-by-country" /></CardTitle></CardHeader>
					<CardContent className="p-0">
						<div className="h-[400px] w-full bg-[#020817]">
							<ComposableMap projectionConfig={{ scale: 160, rotate: [-10, 0, 0] }}>
								<ZoomableGroup>
									<Geographies geography={GEO_URL}>
										{({ geographies }) => geographies.map((geo) => {
											const code = countries.numericToAlpha2(geo.id);
											const cur = summary?.topCountries?.find((s) => s.countryCode === code);
											const centroid = geoCentroid(geo);
											const maxCount = summary?.topCountries?.[0]?.count || 1;
											const intensity = cur ? Math.max(0.2, Math.log(cur.count + 1) / Math.log(maxCount + 1)) : 0;
											const fillColor = cur ? `rgba(6, 182, 212, ${intensity * 0.8 + 0.2})` : "#1e293b";
											return (
												<g key={geo.rsmKey}>
													<Geography geography={geo} fill={fillColor} stroke="#0f172a" strokeWidth={0.5} style={{ default: { outline: "none", transition: "all 250ms" }, hover: { outline: "none", fill: "#0891b2", cursor: "pointer" }, pressed: { outline: "none" } }} />
													{cur && <Marker coordinates={centroid}><circle r={Math.max(2, Math.min(4, Math.log(cur.count) * 1.5))} fill="#ffffff" fillOpacity={0.9} stroke="#06b6d4" strokeWidth={1} style={{ animation: "pulse 2s infinite ease-in-out", transformBox: "fill-box", transformOrigin: "center", pointerEvents: "none" }}><title>{geo.properties.NAME}: {cur.count.toLocaleString()}</title></circle></Marker>}
												</g>
											);
										})}
									</Geographies>
								</ZoomableGroup>
							</ComposableMap>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader><CardTitle><T id="analytics.top-countries" /></CardTitle></CardHeader>
					<CardContent>
						<div className="space-y-4">
							{summary?.topCountries && summary.topCountries.length > 0 ? summary.topCountries.slice(0, 10).map((c) => (
								<div key={c.countryCode} className="flex justify-between text-sm items-center">
									<div className="flex items-center gap-2"><span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{c.countryCode || "??"}</span></div>
									<div className="flex items-center gap-4"><div className="w-24 h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-cyan-500" style={{ width: `${(c.count / (summary?.topCountries?.[0]?.count || 1)) * 100}%` }} /></div><span className="w-12 text-right">{c.count.toLocaleString()}</span></div>
								</div>
							)) : <div className="text-sm text-muted-foreground text-center p-4"><T id="analytics.no-data-list" /></div>}
						</div>
					</CardContent>
				</Card>
			</div>
		</>
	);
};
