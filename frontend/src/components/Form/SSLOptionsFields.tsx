import { Field, useFormikContext } from "formik";
import { DNSProviderFields, DomainNamesField } from "src/components";
import { T } from "src/locale";
import { Switch } from "src/components/ui/switch";
import { Label } from "src/components/ui/label";

interface Props {
	forHttp?: boolean; // the sslForced, http2Support, hstsEnabled, hstsSubdomains fields
	forceDNSForNew?: boolean;
	requireDomainNames?: boolean; // used for streams
	color?: string; // Kept for compatibility but might need to map to Tailwind colors
}

export function SSLOptionsFields({ forHttp = true, forceDNSForNew, requireDomainNames, color: _color }: Props) {
	const { values, setFieldValue } = useFormikContext();
	const v: any = values || {};

	const newCertificate = v?.certificateId === "new";
	const hasCertificate = newCertificate || (v?.certificateId && v?.certificateId > 0 && v?.certificateId !== "0");
	const { sslForced, http2Support, hstsEnabled, hstsSubdomains, meta } = v;
	const { dnsChallenge } = meta || {};

	if (forceDNSForNew && newCertificate && !dnsChallenge) {
		setFieldValue("meta.dnsChallenge", true);
	}

	const handleToggleChange = (checked: boolean, fieldName: string) => {
		setFieldValue(fieldName, checked);
		if (fieldName === "meta.dnsChallenge" && !checked) {
			setFieldValue("meta.dnsProvider", undefined);
			setFieldValue("meta.dnsProviderCredentials", undefined);
			setFieldValue("meta.propagationSeconds", undefined);
		}
	};

	const getHttpOptions = () => (
		<div className="space-y-4">
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<Field name="sslForced">
						{({ field }: any) => (
							<div className="flex items-center space-x-2">
								<Switch
									id="sslForced"
									checked={!!sslForced}
									onCheckedChange={(checked) => handleToggleChange(checked, field.name)}
									disabled={!hasCertificate}
								/>
								<Label htmlFor="sslForced" className={!hasCertificate ? "text-muted-foreground" : ""}>
									<T id="domains.force-ssl" />
								</Label>
							</div>
						)}
					</Field>
				</div>
				<div>
					<Field name="http2Support">
						{({ field }: any) => (
							<div className="flex items-center space-x-2">
								<Switch
									id="http2Support"
									checked={!!http2Support}
									onCheckedChange={(checked) => handleToggleChange(checked, field.name)}
									disabled={!hasCertificate}
								/>
								<Label
									htmlFor="http2Support"
									className={!hasCertificate ? "text-muted-foreground" : ""}
								>
									<T id="domains.http2-support" />
								</Label>
							</div>
						)}
					</Field>
				</div>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div>
					<Field name="hstsEnabled">
						{({ field }: any) => (
							<div className="flex items-center space-x-2">
								<Switch
									id="hstsEnabled"
									checked={!!hstsEnabled}
									onCheckedChange={(checked) => handleToggleChange(checked, field.name)}
									disabled={!hasCertificate || !sslForced}
								/>
								<Label
									htmlFor="hstsEnabled"
									className={!hasCertificate || !sslForced ? "text-muted-foreground" : ""}
								>
									<T id="domains.hsts-enabled" />
								</Label>
							</div>
						)}
					</Field>
				</div>
				<div>
					<Field name="hstsSubdomains">
						{({ field }: any) => (
							<div className="flex items-center space-x-2">
								<Switch
									id="hstsSubdomains"
									checked={!!hstsSubdomains}
									onCheckedChange={(checked) => handleToggleChange(checked, field.name)}
									disabled={!hasCertificate || !hstsEnabled}
								/>
								<Label
									htmlFor="hstsSubdomains"
									className={!hasCertificate || !hstsEnabled ? "text-muted-foreground" : ""}
								>
									<T id="domains.hsts-subdomains" />
								</Label>
							</div>
						)}
					</Field>
				</div>
			</div>
		</div>
	);

	return (
		<div className="space-y-4">
			{forHttp ? getHttpOptions() : null}
			{newCertificate ? (
				<div className="space-y-4">
					<Field name="meta.dnsChallenge">
						{({ field }: any) => (
							<div className="flex items-center space-x-2 mt-4 mb-2">
								<Switch
									id="dnsChallenge"
									checked={forceDNSForNew ? true : !!dnsChallenge}
									onCheckedChange={(checked) => handleToggleChange(checked, field.name)}
									disabled={forceDNSForNew}
								/>
								<Label htmlFor="dnsChallenge">
									<T id="domains.use-dns" />
								</Label>
							</div>
						)}
					</Field>
					{requireDomainNames ? <DomainNamesField isWildcardPermitted dnsProviderWildcardSupported /> : null}
					{dnsChallenge ? <DNSProviderFields showBoundaryBox /> : null}
				</div>
			) : null}
		</div>
	);
}
