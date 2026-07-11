import type { AnalyticsSummary } from "src/api/backend";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { T } from "src/locale";

interface Props {
	summary: AnalyticsSummary | null;
}

export const AnalyticsTopCountries = ({ summary }: Props) => (
	<Card>
		<CardHeader>
			<CardTitle>
				<T id="analytics.top-countries" />
			</CardTitle>
		</CardHeader>
		<CardContent>
			<div className="space-y-4">
				{summary?.topCountries && summary.topCountries.length > 0 ? (
					summary.topCountries.slice(0, 10).map((country) => (
						<div key={country.countryCode} className="flex justify-between text-sm items-center">
							<div className="flex items-center gap-2">
								<span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">
									{country.countryCode || "??"}
								</span>
							</div>
							<div className="flex items-center gap-4">
								<div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
									<div
										className="h-full bg-cyan-500"
										style={{
											width: `${(country.count / (summary.topCountries?.[0]?.count || 1)) * 100}%`,
										}}
									/>
								</div>
								<span className="w-12 text-right">{country.count.toLocaleString()}</span>
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
);
