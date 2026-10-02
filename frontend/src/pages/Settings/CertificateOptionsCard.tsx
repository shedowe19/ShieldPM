import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { useCertificateOptions } from "src/hooks/useRuntimeOptions";
import { T } from "src/locale";
import OptionsCard from "./OptionsCard";

export default function CertificateOptionsCard() {
	const options = useCertificateOptions();
	return (
		<OptionsCard
			{...options}
			title="settings.certificates.options-title"
			valid={(values) =>
				Number.isInteger(values.renewalIntervalHours) &&
				values.renewalIntervalHours >= 1 &&
				values.renewalIntervalHours <= 12
			}
		>
			{(values, change, pending) => (
				<>
					<div className="space-y-2">
						<Label htmlFor="certificateKeyType">
							<T id="settings.certificates.key-type" />
						</Label>
						<Select
							value={values.keyType}
							onValueChange={(keyType) => change({ keyType: keyType as typeof values.keyType })}
							disabled={pending}
						>
							<SelectTrigger id="certificateKeyType">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="ecdsa">ECDSA</SelectItem>
								<SelectItem value="rsa">RSA</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-sm text-muted-foreground">
							<T id="settings.certificates.key-type-description" />
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="renewalIntervalHours">
							<T id="settings.certificates.renewal-interval" />
						</Label>
						<Input
							id="renewalIntervalHours"
							type="number"
							min={1}
							max={12}
							step={1}
							value={Number.isNaN(values.renewalIntervalHours) ? "" : values.renewalIntervalHours}
							disabled={pending}
							onChange={(event) =>
								change({
									renewalIntervalHours:
										event.target.value === "" ? Number.NaN : Number(event.target.value),
								})
							}
						/>
						<p className="text-sm text-muted-foreground">
							<T id="settings.certificates.renewal-interval-description" />
						</p>
					</div>
				</>
			)}
		</OptionsCard>
	);
}
