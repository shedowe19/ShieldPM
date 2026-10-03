import { useMemo } from "react";
import Select, { type MultiValue } from "react-select";
import type { FirewallGeoipStatus } from "src/api/backend/firewallGeoip";
import type { FirewallPolicy } from "src/api/backend/models";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { type FirewallCountryOption, firewallCountryName, firewallCountryOptions } from "src/lib/firewallCountries";
import { intl, T } from "src/locale";

type Props = {
	policy: FirewallPolicy;
	ready: boolean;
	status?: FirewallGeoipStatus;
	loading: boolean;
	error: boolean;
	onRetry: () => void;
	onChange: <K extends keyof FirewallPolicy>(field: K, value: FirewallPolicy[K]) => void;
};

const readinessKeys: Record<NonNullable<FirewallGeoipStatus["reason"]>, string> = {
	module_disabled: "firewall.host.geoip.moduleDisabled",
	database_missing: "firewall.host.geoip.databaseMissing",
	country_variable_missing: "firewall.host.geoip.countryVariableMissing",
	configuration_unavailable: "firewall.host.geoip.configurationUnavailable",
};

const ProxyHostFirewallCountrySettings = ({ policy, ready, status, loading, error, onRetry, onChange }: Props) => {
	const language = intl.locale || "en";
	const options = useMemo(() => firewallCountryOptions(language), [language]);
	const selected = policy.countryDenylist.map((code) => ({
		value: code,
		label: `${firewallCountryName(code, language)} · ${code}`,
	}));
	const selectCountries = (chosen: MultiValue<FirewallCountryOption>) => {
		const next = chosen.map((country) => country.value);
		onChange("countryDenylist", ready ? next : next.filter((code) => policy.countryDenylist.includes(code)));
	};

	return (
		<section className="rounded-md border p-4 space-y-4" aria-labelledby="ip-firewall-country-heading">
			<div className="space-y-1">
				<h4 id="ip-firewall-country-heading" className="text-sm font-medium">
					<T id="firewall.host.countries.title" />
				</h4>
				<p className="text-sm text-muted-foreground">
					<T id="firewall.host.countries.description" />
				</p>
			</div>
			{!ready && (
				<Alert>
					<AlertDescription>
						<p>
							<T
								id={
									loading
										? "firewall.host.geoip.loading"
										: error
											? "firewall.host.geoip.error"
											: status?.reason
												? readinessKeys[status.reason]
												: "firewall.host.geoip.configurationUnavailable"
								}
							/>
						</p>
						{!loading && (
							<Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
								<T id="firewall.host.geoip.retry" />
							</Button>
						)}
						<p className="mt-2">
							<T id="firewall.host.geoip.rulesRetained" />
						</p>
					</AlertDescription>
				</Alert>
			)}
			<div className="space-y-2">
				<Label htmlFor="ip-firewall-countries">
					<T id="firewall.host.countries.selection" />
				</Label>
				<Select<FirewallCountryOption, true>
					inputId="ip-firewall-countries"
					className="react-select-container"
					classNamePrefix="react-select"
					isMulti
					isClearable
					closeMenuOnSelect={false}
					options={options}
					value={selected}
					onChange={selectCountries}
					isOptionDisabled={() => !ready}
					placeholder={intl.formatMessage({ id: "firewall.host.countries.placeholder" })}
					noOptionsMessage={() => intl.formatMessage({ id: "firewall.host.countries.noMatches" })}
					styles={{
						control: (base) => ({
							...base,
							backgroundColor: "hsl(var(--background))",
							borderColor: "hsl(var(--input))",
							color: "hsl(var(--foreground))",
						}),
						menu: (base) => ({
							...base,
							zIndex: 50,
							backgroundColor: "hsl(var(--popover))",
							color: "hsl(var(--popover-foreground))",
						}),
						option: (base, state) => ({
							...base,
							backgroundColor: state.isFocused ? "hsl(var(--accent))" : "transparent",
							color: state.isDisabled ? "hsl(var(--muted-foreground))" : "hsl(var(--foreground))",
						}),
						multiValue: (base) => ({ ...base, backgroundColor: "hsl(var(--secondary))" }),
						multiValueLabel: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
						input: (base) => ({ ...base, color: "hsl(var(--foreground))" }),
					}}
				/>
				<p className="text-sm text-muted-foreground">
					<T id="firewall.host.countries.selectionHint" />
				</p>
			</div>
			<div className="space-y-2">
				<Label htmlFor="ip-firewall-country-reason">
					<T id="firewall.host.countries.reason" />
				</Label>
				<Input
					id="ip-firewall-country-reason"
					value={policy.countryReason}
					maxLength={1000}
					onChange={(event) => onChange("countryReason", event.target.value)}
				/>
				<p className="text-sm text-muted-foreground">
					<T id="firewall.host.countries.reasonHint" />
				</p>
			</div>
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-1">
					<Label htmlFor="ip-firewall-country-unknown">
						<T id="firewall.host.countries.blockUnknown" />
					</Label>
					<p className="text-sm text-muted-foreground">
						<T id="firewall.host.countries.blockUnknownHint" />
					</p>
				</div>
				<Switch
					id="ip-firewall-country-unknown"
					checked={policy.blockUnknownCountry}
					disabled={!ready && !policy.blockUnknownCountry}
					onCheckedChange={(checked) => {
						if (!checked || ready) onChange("blockUnknownCountry", checked);
					}}
				/>
			</div>
		</section>
	);
};

export default ProxyHostFirewallCountrySettings;
