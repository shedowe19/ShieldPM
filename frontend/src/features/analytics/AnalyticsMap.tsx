import { geoCentroid } from "d3-geo";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import type { AnalyticsSummary } from "src/api/backend";
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
}

export const AnalyticsMap = ({ summary }: Props) => {
	return (
		<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
			<Card className="overflow-hidden">
				<style>{pulseStyle}</style>
				<CardHeader>
					<CardTitle>
						<T id="analytics.requests-by-country" />
					</CardTitle>
				</CardHeader>
				<CardContent className="p-0">
					<div className="h-[400px] w-full bg-[#020817]">
						<ComposableMap projectionConfig={{ scale: 160, rotate: [-10, 0, 0] }}>
							<ZoomableGroup>
								<Geographies geography={GEO_URL}>
									{({ geographies }) =>
										geographies.map((geo) => {
											const code = countries.numericToAlpha2(geo.id);
											const cur = summary?.topCountries?.find((s) => s.countryCode === code);
											const centroid = geoCentroid(geo);
											const maxCount = summary?.topCountries?.[0]?.count || 1;
											const intensity = cur
												? Math.max(0.2, Math.log(cur.count + 1) / Math.log(maxCount + 1))
												: 0;
											const fillColor = cur
												? `rgba(6, 182, 212, ${intensity * 0.8 + 0.2})`
												: "#1e293b";
											return (
												<g key={geo.rsmKey}>
													<Geography
														geography={geo}
														fill={fillColor}
														stroke="#0f172a"
														strokeWidth={0.5}
														style={{
															default: { outline: "none", transition: "all 250ms" },
															hover: {
																outline: "none",
																fill: "#0891b2",
																cursor: "pointer",
															},
															pressed: { outline: "none" },
														}}
													/>
													{cur && (
														<Marker coordinates={centroid}>
															<circle
																r={Math.max(2, Math.min(4, Math.log(cur.count) * 1.5))}
																fill="#ffffff"
																fillOpacity={0.9}
																stroke="#06b6d4"
																strokeWidth={1}
																style={{
																	animation: "pulse 2s infinite ease-in-out",
																	transformBox: "fill-box",
																	transformOrigin: "center",
																	pointerEvents: "none",
																}}
															>
																<title>
																	{geo.properties.NAME}: {cur.count.toLocaleString()}
																</title>
															</circle>
														</Marker>
													)}
												</g>
											);
										})
									}
								</Geographies>
							</ZoomableGroup>
						</ComposableMap>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>
						<T id="analytics.top-countries" />
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="space-y-4">
						{summary?.topCountries && summary.topCountries.length > 0 ? (
							summary.topCountries.slice(0, 10).map((c) => (
								<div key={c.countryCode} className="flex justify-between text-sm items-center">
									<div className="flex items-center gap-2">
										<span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">
											{c.countryCode || "??"}
										</span>
									</div>
									<div className="flex items-center gap-4">
										<div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
											<div
												className="h-full bg-cyan-500"
												style={{
													width: `${(c.count / (summary?.topCountries?.[0]?.count || 1)) * 100}%`,
												}}
											/>
										</div>
										<span className="w-12 text-right">{c.count.toLocaleString()}</span>
									</div>
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
};
