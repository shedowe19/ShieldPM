import { useFormikContext } from "formik";
import { Plus, Trash2 } from "lucide-react";
import type { FirewallAsnStatus } from "src/api/backend/firewallGeoip";
import type { FirewallPolicy } from "src/api/backend/models";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { MAX_FIREWALL_ASN_RULES, parseFirewallAsn } from "src/lib/firewallAsn";
import { intl, T } from "src/locale";

type Props = {
	policy: FirewallPolicy;
	ready: boolean;
	status?: FirewallAsnStatus;
	loading: boolean;
	error: boolean;
	onRetry: () => void;
	onChange: <K extends keyof FirewallPolicy>(field: K, value: FirewallPolicy[K]) => void;
};

const readinessKeys: Record<NonNullable<FirewallAsnStatus["reason"]>, string> = {
	module_disabled: "firewall.host.asn.moduleDisabled",
	database_missing: "firewall.host.asn.databaseMissing",
	asn_variable_missing: "firewall.host.asn.lookupMissing",
	configuration_unavailable: "firewall.host.asn.configurationUnavailable",
};

const ProxyHostFirewallAsnSettings = ({ policy, ready, status, loading, error, onRetry, onChange }: Props) => {
	const { status: formStatus, setStatus } = useFormikContext();
	// Formik status survives tab unmounts and is never part of the submitted host payload.
	const rawAsns: string[] =
		formStatus?.firewallAsnInputs ?? policy.asnDenylist.map((rule) => (rule.asn ? String(rule.asn) : ""));
	const setRawAsns = (values: string[]) => setStatus({ ...formStatus, firewallAsnInputs: values });
	const updateEntry = (index: number, changes: Partial<FirewallPolicy["asnDenylist"][number]>) =>
		onChange(
			"asnDenylist",
			policy.asnDenylist.map((rule, position) => (position === index ? { ...rule, ...changes } : rule)),
		);

	return (
		<section className="rounded-md border p-4 space-y-4" aria-labelledby="ip-firewall-asn-heading">
			<div className="space-y-1">
				<h4 id="ip-firewall-asn-heading" className="text-sm font-medium">
					<T id="firewall.host.asn.title" />
				</h4>
				<p className="text-sm text-muted-foreground">
					<T id="firewall.host.asn.description" />
				</p>
			</div>
			{!ready && (
				<Alert>
					<AlertDescription>
						<p>
							<T
								id={
									loading
										? "firewall.host.asn.loading"
										: error
											? "firewall.host.asn.error"
											: status?.reason
												? readinessKeys[status.reason]
												: "firewall.host.asn.configurationUnavailable"
								}
							/>
						</p>
						{!loading && (
							<Button type="button" variant="outline" size="sm" className="mt-2" onClick={onRetry}>
								<T id="firewall.host.geoip.retry" />
							</Button>
						)}
						<p className="mt-2">
							<T id="firewall.host.asn.rulesRetained" />
						</p>
					</AlertDescription>
				</Alert>
			)}
			<div className="space-y-3">
				{policy.asnDenylist.map((rule, index) => {
					const raw = rawAsns[index] ?? String(rule.asn);
					const invalid = parseFirewallAsn(raw) === null;
					const duplicate = policy.asnDenylist.some(
						(other, position) => position !== index && other.asn === rule.asn,
					);
					const rowError = invalid
						? "firewall.host.asn.invalid"
						: duplicate
							? "firewall.host.asn.duplicate"
							: null;
					return (
						<div key={index} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border p-3">
							<div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
								<div className="space-y-1">
									<Label htmlFor={`ip-firewall-asn-${index}`}>
										<T id="firewall.host.asn.number" />
									</Label>
									<Input
										id={`ip-firewall-asn-${index}`}
										value={raw}
										placeholder="AS13335"
										maxLength={64}
										disabled={!ready}
										aria-invalid={!!rowError}
										aria-describedby={rowError ? `ip-firewall-asn-error-${index}` : undefined}
										onChange={(event) => {
											const value = event.target.value;
											setRawAsns(
												rawAsns.map((text, position) => (position === index ? value : text)),
											);
											// Keep invalid rows in the draft so validation can prevent saving them.
											updateEntry(index, { asn: parseFirewallAsn(value) ?? 0 });
										}}
									/>
									{rowError && (
										<p
											id={`ip-firewall-asn-error-${index}`}
											role="alert"
											className="text-xs text-destructive"
										>
											<T id={rowError} />
										</p>
									)}
								</div>
								<div className="space-y-1">
									<Label htmlFor={`ip-firewall-asn-reason-${index}`}>
										<T id="firewall.host.asn.reason" />
									</Label>
									<Input
										id={`ip-firewall-asn-reason-${index}`}
										value={rule.reason}
										maxLength={1000}
										onChange={(event) => updateEntry(index, { reason: event.target.value })}
									/>
								</div>
							</div>
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="self-end"
								aria-label={intl.formatMessage({ id: "firewall.host.asn.remove" }, { row: index + 1 })}
								onClick={() => {
									setRawAsns(rawAsns.filter((_, position) => position !== index));
									onChange(
										"asnDenylist",
										policy.asnDenylist.filter((_, position) => position !== index),
									);
								}}
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					);
				})}
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={!ready || policy.asnDenylist.length >= MAX_FIREWALL_ASN_RULES}
					onClick={() => {
						if (!ready || policy.asnDenylist.length >= MAX_FIREWALL_ASN_RULES) return;
						setRawAsns([...rawAsns, ""]);
						onChange("asnDenylist", [...policy.asnDenylist, { asn: 0, reason: "" }]);
					}}
				>
					<Plus className="mr-2 h-4 w-4" />
					<T id="firewall.host.asn.add" />
				</Button>
				<p className="text-sm text-muted-foreground">
					<T id="firewall.host.asn.reasonHint" />
				</p>
			</div>
		</section>
	);
};

export default ProxyHostFirewallAsnSettings;
