import { geoCentroid } from "d3-geo";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from "react-simple-maps";
import type { AnalyticsSummary } from "src/api/backend";

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

const AnalyticsMapContent = ({ summary }: Props) => (
	<>
		<style>{pulseStyle}</style>
		<ComposableMap projectionConfig={{ scale: 160, rotate: [-10, 0, 0] }}>
			<ZoomableGroup>
				<Geographies geography={GEO_URL}>
					{({ geographies }) =>
						geographies.map((geo) => {
							const code = countries.numericToAlpha2(geo.id);
							const cur = summary?.topCountries?.find((s) => s.countryCode === code);
							const centroid = geoCentroid(geo);
							const maxCount = summary?.topCountries?.[0]?.count || 1;
							const intensity = cur ? Math.max(0.2, Math.log(cur.count + 1) / Math.log(maxCount + 1)) : 0;
							const fillColor = cur ? `rgba(6, 182, 212, ${intensity * 0.8 + 0.2})` : "#1e293b";

							return (
								<g key={geo.rsmKey}>
									<Geography
										geography={geo}
										fill={fillColor}
										stroke="#0f172a"
										strokeWidth={0.5}
										style={{
											default: { outline: "none", transition: "all 250ms" },
											hover: { outline: "none", fill: "#0891b2", cursor: "pointer" },
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
	</>
);

export default AnalyticsMapContent;
