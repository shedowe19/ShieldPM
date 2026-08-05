import { geoCentroid, geoNaturalEarth1, geoPath } from "d3-geo";
import type { Feature, Geometry } from "geojson";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import { type PointerEvent, useRef, useState, type WheelEvent } from "react";
import type { AnalyticsSummary } from "src/api/backend";
import { feature } from "topojson-client";
import type { Topology, GeometryCollection as TopologyGeometryCollection } from "topojson-specification";
import worldAtlas from "world-atlas/countries-110m.json";

countries.registerLocale(enLocale);

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;
const MIN_VIEWBOX_WIDTH = 240;
const ZOOM_FACTOR = 0.85;
const initialViewBox = { height: MAP_HEIGHT, width: MAP_WIDTH, x: 0, y: 0 };

const pulseStyle = `
@keyframes pulse {
	0% { transform: scale(1); opacity: 1; }
	50% { transform: scale(1.5); opacity: 0.5; }
	100% { transform: scale(1); opacity: 1; }
}
`;

type CountryProperties = Record<string, unknown> & {
	NAME?: string;
	name?: string;
};

type WorldAtlasTopology = Topology<{
	countries: TopologyGeometryCollection<CountryProperties>;
}>;

interface MapPoint {
	x: number;
	y: number;
}

interface ViewBox {
	height: number;
	width: number;
	x: number;
	y: number;
}

interface Props {
	summary: AnalyticsSummary | null;
}

const topology = worldAtlas as unknown as WorldAtlasTopology;
const countriesTopology = feature<CountryProperties>(topology, topology.objects.countries);
const countryFeatures = countriesTopology.features as Feature<Geometry, CountryProperties>[];
const projection = geoNaturalEarth1()
	.scale(160)
	.rotate([-10, 0])
	.translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]);
const path = geoPath(projection);

const clampViewBox = ({ width, x, y }: ViewBox): ViewBox => {
	const clampedWidth = Math.max(MIN_VIEWBOX_WIDTH, Math.min(MAP_WIDTH, width));
	const clampedHeight = (clampedWidth / MAP_WIDTH) * MAP_HEIGHT;
	return {
		height: clampedHeight,
		width: clampedWidth,
		x: Math.max(0, Math.min(MAP_WIDTH - clampedWidth, x)),
		y: Math.max(0, Math.min(MAP_HEIGHT - clampedHeight, y)),
	};
};

const mapPointFromEvent = (
	svg: SVGSVGElement,
	event: { clientX: number; clientY: number },
	viewBox: ViewBox,
): MapPoint => {
	const bounds = svg.getBoundingClientRect();
	const width = bounds.width || MAP_WIDTH;
	const height = bounds.height || MAP_HEIGHT;
	return {
		x: viewBox.x + ((event.clientX - bounds.left) / width) * viewBox.width,
		y: viewBox.y + ((event.clientY - bounds.top) / height) * viewBox.height,
	};
};

const countryCodeFor = (country: Feature<Geometry, CountryProperties>) => {
	const numericCode = Number(country.id);
	return Number.isFinite(numericCode) ? countries.numericToAlpha2(numericCode) : undefined;
};

const AnalyticsMapContent = ({ summary }: Props) => {
	const [isDragging, setIsDragging] = useState(false);
	const [viewBox, setViewBox] = useState<ViewBox>(initialViewBox);
	const drag = useRef<{ point: MapPoint; viewBox: ViewBox } | null>(null);
	const requestsByCountry = new Map(summary?.topCountries?.map((country) => [country.countryCode, country.count]));
	const maxCount = summary?.topCountries?.[0]?.count || 1;

	const onWheel = (event: WheelEvent<SVGSVGElement>) => {
		event.preventDefault();
		setViewBox((current) => {
			const point = mapPointFromEvent(event.currentTarget, event, current);
			const nextWidth = current.width * (event.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR);
			const scale = nextWidth / current.width;
			return clampViewBox({
				height: current.height * scale,
				width: nextWidth,
				x: point.x - (point.x - current.x) * scale,
				y: point.y - (point.y - current.y) * scale,
			});
		});
	};

	const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
		if (event.button !== 0) {
			return;
		}
		event.currentTarget.setPointerCapture(event.pointerId);
		drag.current = { point: mapPointFromEvent(event.currentTarget, event, viewBox), viewBox };
		setIsDragging(true);
	};

	const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
		if (!drag.current) {
			return;
		}
		const currentPoint = mapPointFromEvent(event.currentTarget, event, drag.current.viewBox);
		setViewBox(
			clampViewBox({
				...drag.current.viewBox,
				x: drag.current.viewBox.x - (currentPoint.x - drag.current.point.x),
				y: drag.current.viewBox.y - (currentPoint.y - drag.current.point.y),
			}),
		);
	};

	const stopDragging = (event: PointerEvent<SVGSVGElement>) => {
		if (drag.current && event.currentTarget.hasPointerCapture(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
		drag.current = null;
		setIsDragging(false);
	};

	return (
		<>
			<style>{pulseStyle}</style>
			<svg
				aria-label="Requests by country map. Scroll to zoom, drag to pan, double-click to reset."
				className={isDragging ? "cursor-grabbing" : "cursor-grab"}
				data-testid="analytics-world-map"
				height="100%"
				onDoubleClick={() => setViewBox(initialViewBox)}
				onPointerCancel={stopDragging}
				onPointerDown={onPointerDown}
				onPointerMove={onPointerMove}
				onPointerUp={stopDragging}
				onWheel={onWheel}
				role="img"
				style={{ touchAction: "none" }}
				viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
				width="100%"
			>
				{countryFeatures.map((country, countryIndex) => {
					const code = countryCodeFor(country);
					const count = code ? requestsByCountry.get(code) : undefined;
					const hasCount = count !== undefined;
					const intensity = hasCount ? Math.max(0.2, Math.log(count + 1) / Math.log(maxCount + 1)) : 0;
					const fill = hasCount ? `rgba(6, 182, 212, ${intensity * 0.8 + 0.2})` : "#1e293b";
					const centroid = projection(geoCentroid(country));
					const countryName = country.properties.name || country.properties.NAME || code || "Unknown country";

					return (
						<g
							key={`${country.id || country.properties.name || country.properties.NAME || "country"}-${countryIndex}`}
						>
							<path
								d={path(country) || undefined}
								fill={fill}
								stroke="#0f172a"
								strokeWidth={0.5}
								style={{ cursor: "default", transition: "fill 250ms" }}
							>
								{hasCount && <title>{`${countryName}: ${count.toLocaleString()}`}</title>}
							</path>
							{hasCount && centroid && (
								<circle
									cx={centroid[0]}
									cy={centroid[1]}
									fill="#ffffff"
									fillOpacity={0.9}
									r={Math.max(2, Math.min(4, Math.log(Math.max(count, 1)) * 1.5))}
									stroke="#06b6d4"
									strokeWidth={1}
									style={{
										animation: "pulse 2s infinite ease-in-out",
										pointerEvents: "none",
										transformBox: "fill-box",
										transformOrigin: "center",
									}}
								/>
							)}
						</g>
					);
				})}
			</svg>
		</>
	);
};

export default AnalyticsMapContent;
