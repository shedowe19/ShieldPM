import { geoCentroid, geoEqualEarth, geoPath } from "d3-geo";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import type { PointerEvent, WheelEvent } from "react";
import { useMemo, useRef, useState } from "react";
import type { AnalyticsSummary } from "src/api/backend";
import { intl } from "src/locale";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import worldAtlas from "world-atlas/countries-110m.json";

const MAP_WIDTH = 800;
const MAP_HEIGHT = 600;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const WHEEL_ZOOM_FACTOR = 1.2;

const pulseStyle = `
	@keyframes pulse {
		0% { transform: scale(1); opacity: 1; }
		50% { transform: scale(1.5); opacity: 0.5; }
		100% { transform: scale(1); opacity: 1; }
	}
`;

const worldTopology = worldAtlas as unknown as Topology;
const worldCountries = (feature(worldTopology, worldTopology.objects.countries) as FeatureCollection<Geometry>)
	.features as Feature<Geometry>[];

countries.registerLocale(enLocale);

interface Props {
	summary: AnalyticsSummary | null;
}

interface Viewport {
	scale: number;
	x: number;
	y: number;
}

interface PointerOrigin {
	clientX: number;
	clientY: number;
	viewport: Viewport;
}

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

const AnalyticsMapContent = ({ summary }: Props) => {
	const mapRef = useRef<SVGSVGElement>(null);
	const pointerOrigin = useRef<PointerOrigin | undefined>(undefined);
	const [hoveredCountryId, setHoveredCountryId] = useState<string | undefined>(undefined);
	const [viewport, setViewport] = useState<Viewport>({ scale: MIN_ZOOM, x: 0, y: 0 });
	const projection = useMemo(
		() =>
			geoEqualEarth()
				.rotate([-10, 0, 0])
				.scale(160)
				.translate([MAP_WIDTH / 2, MAP_HEIGHT / 2]),
		[],
	);
	const countryPath = useMemo(() => geoPath(projection), [projection]);
	const countriesByCode = useMemo(
		() => new Map((summary?.topCountries ?? []).map((country) => [country.countryCode, country])),
		[summary?.topCountries],
	);

	const getMapPoint = (clientX: number, clientY: number) => {
		const bounds = mapRef.current?.getBoundingClientRect();
		if (!bounds?.width || !bounds.height) {
			return undefined;
		}

		const safeClientX = Number.isFinite(clientX) ? clientX : bounds.left + bounds.width / 2;
		const safeClientY = Number.isFinite(clientY) ? clientY : bounds.top + bounds.height / 2;

		return {
			x: ((safeClientX - bounds.left) / bounds.width) * MAP_WIDTH,
			y: ((safeClientY - bounds.top) / bounds.height) * MAP_HEIGHT,
		};
	};

	const zoomAtPoint = (clientX: number, clientY: number, factor: number) => {
		const point = getMapPoint(clientX, clientY);
		if (!point) {
			return;
		}

		setViewport((current) => {
			const scale = clampZoom(current.scale * factor);
			if (scale === current.scale) {
				return current;
			}

			return {
				scale,
				x: point.x - ((point.x - current.x) * scale) / current.scale,
				y: point.y - ((point.y - current.y) * scale) / current.scale,
			};
		});
	};

	const handlePointerDown = (event: PointerEvent<SVGSVGElement>) => {
		if (event.button !== 0) {
			return;
		}

		event.currentTarget.setPointerCapture?.(event.pointerId);
		pointerOrigin.current = { clientX: event.clientX, clientY: event.clientY, viewport };
	};

	const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
		const origin = pointerOrigin.current;
		const bounds = mapRef.current?.getBoundingClientRect();
		if (!origin || !bounds?.width || !bounds.height) {
			return;
		}

		setViewport({
			scale: origin.viewport.scale,
			x: origin.viewport.x + ((event.clientX - origin.clientX) / bounds.width) * MAP_WIDTH,
			y: origin.viewport.y + ((event.clientY - origin.clientY) / bounds.height) * MAP_HEIGHT,
		});
	};

	const handlePointerEnd = (event: PointerEvent<SVGSVGElement>) => {
		pointerOrigin.current = undefined;
		if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
			event.currentTarget.releasePointerCapture?.(event.pointerId);
		}
	};

	const handleWheel = (event: WheelEvent<SVGSVGElement>) => {
		event.preventDefault();
		if (event.deltaY !== 0) {
			zoomAtPoint(event.clientX, event.clientY, event.deltaY < 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR);
		}
	};

	return (
		<>
			<style>{pulseStyle}</style>
			<svg
				aria-labelledby="analytics-map-title"
				className="h-full w-full touch-none select-none"
				data-testid="analytics-map-canvas"
				onDoubleClick={(event) => {
					event.preventDefault();
					zoomAtPoint(event.clientX, event.clientY, 2);
				}}
				onPointerCancel={handlePointerEnd}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerEnd}
				onWheel={handleWheel}
				ref={mapRef}
				viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
			>
				<title id="analytics-map-title">{intl.formatMessage({ id: "analytics.requests-by-country" })}</title>
				<rect fill="transparent" height={MAP_HEIGHT} width={MAP_WIDTH} />
				<g
					data-testid="analytics-map-viewport"
					transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}
				>
					{worldCountries.map((country, index) => {
						const countryId = country.id === undefined ? `country-${index}` : String(country.id);
						const countryCode = countries.numericToAlpha2(countryId);
						const currentCountry = countryCode ? countriesByCode.get(countryCode) : undefined;
						const maxCount = summary?.topCountries?.[0]?.count || 1;
						const intensity = currentCountry
							? Math.max(0.2, Math.log(currentCountry.count + 1) / Math.log(maxCount + 1))
							: 0;
						const fillColor = currentCountry ? `rgba(6, 182, 212, ${intensity * 0.8 + 0.2})` : "#1e293b";
						const markerPosition = currentCountry ? projection(geoCentroid(country)) : undefined;
						const countryName = country.properties?.name || countryCode || countryId;
						const path = countryPath(country);

						if (!path) {
							return null;
						}

						return (
							<g key={countryId}>
								<path
									className="transition-colors duration-200"
									cursor="grab"
									data-country-code={countryCode || undefined}
									d={path}
									fill={hoveredCountryId === countryId ? "#0891b2" : fillColor}
									onPointerEnter={() => setHoveredCountryId(countryId)}
									onPointerLeave={() => setHoveredCountryId(undefined)}
									stroke="#0f172a"
									strokeWidth={0.5}
								/>
								{currentCountry && markerPosition && (
									<circle
										cx={markerPosition[0]}
										cy={markerPosition[1]}
										data-country-code={countryCode}
										data-testid={`analytics-map-marker-${countryCode}`}
										fill="#ffffff"
										fillOpacity={0.9}
										pointerEvents="none"
										r={Math.max(2, Math.min(4, Math.log(currentCountry.count) * 1.5))}
										stroke="#06b6d4"
										strokeWidth={1}
										style={{
											animation: "pulse 2s infinite ease-in-out",
											transformBox: "fill-box",
											transformOrigin: "center",
										}}
									>
										<title>
											{countryName}: {currentCountry.count.toLocaleString()}
										</title>
									</circle>
								)}
							</g>
						);
					})}
				</g>
			</svg>
		</>
	);
};

export default AnalyticsMapContent;
