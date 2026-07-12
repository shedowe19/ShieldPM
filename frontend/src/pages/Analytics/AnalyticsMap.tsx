import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { AnalyticsSummary } from "src/api/backend";
import { Loading } from "src/components/Loading";
import { RouteErrorBoundary } from "src/components/RouteErrorBoundary";

const AnalyticsMapContent = lazy(() => import("./AnalyticsMapContent"));

interface Props {
	summary: AnalyticsSummary | null;
}

export const AnalyticsMap = ({ summary }: Props) => {
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
		<div ref={containerRef} className="h-[400px] w-full bg-[#020817]">
			{shouldLoad ? (
				<RouteErrorBoundary>
					<Suspense fallback={<Loading noLogo />}>
						<AnalyticsMapContent summary={summary} />
					</Suspense>
				</RouteErrorBoundary>
			) : (
				<Loading noLogo />
			)}
		</div>
	);
};
