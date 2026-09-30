import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { useIpRangesOptions } from "src/hooks/useRuntimeOptions";
import { T } from "src/locale";
import OptionsCard from "./OptionsCard";

export default function Network() {
	const options = useIpRangesOptions();
	return (
		<OptionsCard
			{...options}
			title="settings.network.ip-ranges-title"
			valid={(values) =>
				Number.isInteger(values.refreshIntervalHours) &&
				values.refreshIntervalHours >= 6 &&
				values.refreshIntervalHours <= 594 &&
				values.refreshIntervalHours % 6 === 0
			}
		>
			{(values, change, pending) => (
				<>
					<p className="text-sm text-muted-foreground">
						<T id="settings.network.ip-ranges-description" />
					</p>
					<div className="flex items-center gap-2">
						<Switch
							id="ipRangesEnabled"
							checked={values.enabled}
							disabled={pending}
							onCheckedChange={(enabled) => change({ enabled })}
						/>
						<Label htmlFor="ipRangesEnabled">
							<T id="settings.network.ip-ranges-enabled" />
						</Label>
					</div>
					<div className="space-y-2">
						<Label htmlFor="refreshIntervalHours">
							<T id="settings.network.ip-ranges-interval" />
						</Label>
						<Input
							id="refreshIntervalHours"
							type="number"
							min={6}
							max={594}
							step={6}
							value={Number.isNaN(values.refreshIntervalHours) ? "" : values.refreshIntervalHours}
							disabled={pending}
							onChange={(event) =>
								change({
									refreshIntervalHours:
										event.target.value === "" ? Number.NaN : Number(event.target.value),
								})
							}
						/>
						<p className="text-sm text-muted-foreground">
							<T id="settings.network.ip-ranges-interval-description" />
						</p>
					</div>
				</>
			)}
		</OptionsCard>
	);
}
