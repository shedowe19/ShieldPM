import { lazy, Suspense } from "react";
import type { AnalyticsSummary, TimeSeriesPoint } from "src/api/backend";
import { Loading } from "src/components";

const AnalyticsCharts = lazy(() => import("./AnalyticsCharts").then((module) => ({ default: module.AnalyticsCharts })));
const AnalyticsMap = lazy(() => import("./AnalyticsMap").then((module) => ({ default: module.AnalyticsMap })));

interface Props {
	summary: AnalyticsSummary | null;
	series: (TimeSeriesPoint & { timeDisplay: string })[];
}

export const AnalyticsVisuals = ({ summary, series }: Props) => {
	return (
		<>
			<Suspense fallback={<div className="p-8 text-center"><Loading /></div>}>
				<AnalyticsCharts series={series} />
			</Suspense>
			<Suspense fallback={<div className="p-8 text-center"><Loading /></div>}>
				<AnalyticsMap summary={summary} />
			</Suspense>
		</>
	);
};
