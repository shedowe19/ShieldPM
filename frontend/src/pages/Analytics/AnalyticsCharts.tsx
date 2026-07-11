import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { TimeSeriesPoint } from "src/api/backend";
import { Loading } from "src/components/Loading";
import { RouteErrorBoundary } from "src/components/RouteErrorBoundary";

const AnalyticsChartContent = lazy(() => import("./AnalyticsChartContent"));

interface Props {
	series: (TimeSeriesPoint & { timeDisplay: string })[];
}

const ChartLoading = () => (
	<div className="col-span-full h-[350px] flex items-center justify-center">
		<Loading noLogo />
	</div>
);

export const AnalyticsCharts = ({ series }: Props) => {
	const containerRef = useRef<HTMLDivElement>(null);
	const [shouldLoad, setShouldLoad] = useState(false);

	useEffect(() => {
		const container = containerRef.current;
		if (!container || !("IntersectionObserver" in window)) {
			setShouldLoad(true);
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					setShouldLoad(true);
					observer.disconnect();
				}
			},
			{ rootMargin: "200px" },
		);
		observer.observe(container);

		return () => observer.disconnect();
	}, []);

	return (
		<RouteErrorBoundary>
			<div ref={containerRef} className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
				{shouldLoad ? (
					<Suspense fallback={<ChartLoading />}>
						<AnalyticsChartContent series={series} />
					</Suspense>
				) : (
					<ChartLoading />
				)}
			</div>
		</RouteErrorBoundary>
	);
};
