import { Alert, AlertDescription } from "src/components/ui/alert";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { useAnalyticsOptions } from "src/hooks/useRuntimeOptions";
import { T } from "src/locale";
import OptionsCard from "./OptionsCard";

export default function Analytics() {
	const options = useAnalyticsOptions();
	return (
		<OptionsCard
			{...options}
			title="settings.analytics.retention-title"
			valid={(values) => Object.values(values).every((value) => Number.isSafeInteger(value) && value >= 1)}
		>
			{(values, change, pending) => (
				<>
					<div className="space-y-2">
						<Label htmlFor="detailedRetentionHours">
							<T id="settings.analytics.detailed-hours" />
						</Label>
						<Input
							id="detailedRetentionHours"
							type="number"
							min={1}
							max={Number.MAX_SAFE_INTEGER}
							step={1}
							value={Number.isNaN(values.detailedRetentionHours) ? "" : values.detailedRetentionHours}
							disabled={pending}
							onChange={(event) =>
								change({
									detailedRetentionHours:
										event.target.value === "" ? Number.NaN : Number(event.target.value),
								})
							}
						/>
						<p className="text-sm text-muted-foreground">
							<T id="settings.analytics.detailed-description" />
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="aggregationRetentionDays">
							<T id="settings.analytics.aggregation-days" />
						</Label>
						<Input
							id="aggregationRetentionDays"
							type="number"
							min={1}
							max={Number.MAX_SAFE_INTEGER}
							step={1}
							value={Number.isNaN(values.aggregationRetentionDays) ? "" : values.aggregationRetentionDays}
							disabled={pending}
							onChange={(event) =>
								change({
									aggregationRetentionDays:
										event.target.value === "" ? Number.NaN : Number(event.target.value),
								})
							}
						/>
					</div>
					<p className="text-sm text-muted-foreground">
						<T id="settings.analytics.cleanup-description" />
					</p>
					{Object.values(values).includes(Number.MAX_SAFE_INTEGER) && (
						<Alert>
							<AlertDescription>
								<T id="settings.analytics.retention-review" />
							</AlertDescription>
						</Alert>
					)}
				</>
			)}
		</OptionsCard>
	);
}
