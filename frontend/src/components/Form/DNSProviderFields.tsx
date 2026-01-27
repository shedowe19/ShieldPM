import { IconAlertTriangle } from "@tabler/icons-react";
import { Field, type FieldProps, useFormikContext } from "formik";
import { useState } from "react";
import Select, { type ActionMeta } from "react-select";
import type { DNSProvider } from "src/api/backend";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import { useDnsProviders } from "src/hooks";
import { intl, T } from "src/locale";

interface DNSProviderOption {
	readonly value: string;
	readonly label: string;
	readonly credentials: string;
}

interface Props {
	showBoundaryBox?: boolean;
}
export function DNSProviderFields({ showBoundaryBox = false }: Props) {
	const { setFieldValue } = useFormikContext();
	const { data: dnsProviders, isLoading } = useDnsProviders();
	const [dnsProviderId, setDnsProviderId] = useState<string | null>(null);

	const handleChange = (newValue: unknown, _actionMeta: ActionMeta<DNSProviderOption>) => {
		const option = newValue as DNSProviderOption | null;
		setFieldValue("meta.dnsProvider", option?.value);
		setFieldValue("meta.dnsProviderCredentials", option?.credentials);
		setDnsProviderId(option?.value || null);
	};

	const options: DNSProviderOption[] =
		dnsProviders?.map((p: DNSProvider) => ({
			value: p.id,
			label: p.name,
			credentials: p.credentials,
		})) || [];

	return (
		<div className={showBoundaryBox ? "border border-yellow-500/50 bg-yellow-500/10 p-4 rounded-md mt-4" : ""}>
			{showBoundaryBox && (
				<div className="text-yellow-600 dark:text-yellow-400 flex items-center mb-4 text-sm font-medium">
					<IconAlertTriangle size={16} className="mr-2" />
					<T id="certificates.dns.warning" />
				</div>
			)}

			<Field name="meta.dnsProvider">
				{({ field }: FieldProps) => (
					<div className="space-y-2">
						<Label htmlFor="dnsProvider">
							<T id="certificates.dns.provider" />
						</Label>
						<Select
							className="react-select-container"
							classNamePrefix="react-select"
							name={field.name}
							id="dnsProvider"
							closeMenuOnSelect={true}
							isClearable={false}
							placeholder={intl.formatMessage({ id: "certificates.dns.provider.placeholder" })}
							isLoading={isLoading}
							isSearchable
							onChange={handleChange}
							options={options}
							styles={{
								control: (baseStyles) => ({
									...baseStyles,
									backgroundColor: "hsl(var(--background))",
									borderColor: "hsl(var(--input))",
									color: "hsl(var(--foreground))",
									minHeight: "2.5rem",
									borderRadius: "calc(var(--radius) - 2px)",
								}),
								menu: (base) => ({
									...base,
									zIndex: 9999,
									backgroundColor: "hsl(var(--popover))",
									color: "hsl(var(--popover-foreground))",
									border: "1px solid hsl(var(--border))",
								}),
								option: (base, state) => ({
									...base,
									backgroundColor: state.isFocused ? "hsl(var(--accent))" : "transparent",
									color: state.isFocused ? "hsl(var(--accent-foreground))" : "hsl(var(--foreground))",
									cursor: "pointer",
								}),
								singleValue: (base) => ({
									...base,
									color: "hsl(var(--foreground))",
								}),
								input: (base) => ({
									...base,
									color: "hsl(var(--foreground))",
								}),
								placeholder: (base) => ({
									...base,
									color: "hsl(var(--muted-foreground))",
								}),
							}}
						/>
					</div>
				)}
			</Field>

			{dnsProviderId ? (
				<>
					<Field name="meta.dnsProviderCredentials">
						{({ field }: FieldProps) => (
							<div className="space-y-2 mt-4">
								<Label htmlFor="dnsProviderCredentials">
									<T id="certificates.dns.credentials" />
								</Label>
								<div className="rounded-md border overflow-hidden">
									<Textarea
										id="dnsProviderCredentials"
										className="font-mono min-h-[130px] bg-[#1e1e1e] border-none focus-visible:ring-1 focus-visible:ring-offset-0"
										spellCheck={false}
										{...field}
									/>
								</div>
								<div>
									<p className="text-sm text-muted-foreground">
										<T id="certificates.dns.credentials-note" />
									</p>
								</div>
								<div>
									<p className="text-sm font-medium text-destructive">
										<T id="certificates.dns.credentials-warning" />
									</p>
								</div>
							</div>
						)}
					</Field>
					<Field name="meta.propagationSeconds">
						{({ field }: FieldProps) => (
							<div className="space-y-2 mt-4">
								<Label htmlFor="propagationSeconds">
									<T id="certificates.dns.propagation-seconds" />
								</Label>
								<Input id="propagationSeconds" type="number" min={0} max={7200} {...field} />
								<p className="text-sm text-muted-foreground">
									<T id="certificates.dns.propagation-seconds-note" />
								</p>
							</div>
						)}
					</Field>
				</>
			) : null}
		</div>
	);
}
