import type { AnalyticsSummary } from "src/api/backend";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { T } from "src/locale";
import { AnalyticsMap } from "./AnalyticsMap";
import { AnalyticsTopCountries } from "./AnalyticsTopCountries";

interface Props {
	summary: AnalyticsSummary | null;
}

export const AnalyticsGeography = ({ summary }: Props) => (
	<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
		<Card className="overflow-hidden">
			<CardHeader>
				<CardTitle>
					<T id="analytics.requests-by-country" />
				</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				<AnalyticsMap summary={summary} />
			</CardContent>
		</Card>

		<AnalyticsTopCountries summary={summary} />
	</div>
);
