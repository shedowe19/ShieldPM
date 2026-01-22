import { IconPlus, IconShield } from "@tabler/icons-react";
import { Field, useFormikContext } from "formik";
import type { Certificate } from "src/api/backend";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Skeleton } from "src/components/ui/skeleton";
import { useCertificates } from "src/hooks";
import { formatDateTime, intl, T } from "src/locale";

interface CertOption {
	readonly value: string; // Ensure value is always string to work with Select
	readonly label: string;
	readonly subLabel: string;
	readonly icon: React.ReactNode;
}

interface Props {
	id?: string;
	name?: string;
	label?: string;
	required?: boolean;
	allowNew?: boolean;
	forHttp?: boolean; // the sslForced, http2Support, hstsEnabled, hstsSubdomains fields
}

export function SSLCertificateField({
	name = "certificateId",
	label = "ssl-certificate",
	id = "certificateId",
	required,
	allowNew,
	forHttp = true,
}: Props) {
	const { isLoading, isError, error, data } = useCertificates();
	const { values, setFieldValue } = useFormikContext();
	const v: any = values || {};

	// Helper to convert value to string for Select component
	// The certificate ID is number, "new" is string, "0" for none
	const getValueString = (val: any) => {
		if (val === undefined || val === null) return "0";
		return String(val);
	};

	const handleChange = (newValue: string) => {
		// Convert back to number if it's a numeric string, unless it's "new"
		let val: number | string = newValue;
		if (newValue !== "new") {
			val = Number.parseInt(newValue, 10);
			if (Number.isNaN(val)) val = 0;
		}

		setFieldValue(name, val);
		const {
			sslForced,
			http2Support,
			hstsEnabled,
			hstsSubdomains,
			dnsChallenge,
			dnsProvider,
			dnsProviderCredentials,
			propagationSeconds,
		} = v;

		if (forHttp && !val) {
			sslForced && setFieldValue("sslForced", false);
			http2Support && setFieldValue("http2Support", false);
			hstsEnabled && setFieldValue("hstsEnabled", false);
			hstsSubdomains && setFieldValue("hstsSubdomains", false);
		}
		if (val !== "new") {
			dnsChallenge && setFieldValue("dnsChallenge", undefined);
			dnsProvider && setFieldValue("dnsProvider", undefined);
			dnsProviderCredentials && setFieldValue("dnsProviderCredentials", undefined);
			propagationSeconds && setFieldValue("propagationSeconds", undefined);
		}
	};

	const options: CertOption[] =
		data?.map((cert: Certificate) => ({
			value: String(cert.id),
			label: cert.niceName,
			subLabel: `${cert.provider === "letsencrypt" ? intl.formatMessage({ id: "lets-encrypt" }) : cert.provider} — ${intl.formatMessage({ id: "expires.on" }, { date: cert.expiresOn ? formatDateTime(cert.expiresOn) : "N/A" })}`,
			icon: <IconShield size={14} className="text-pink-500" />,
		})) || [];

	// Prepend the Add New option
	if (allowNew) {
		options?.unshift({
			value: "new",
			label: intl.formatMessage({ id: "certificates.request.title" }),
			subLabel: intl.formatMessage({ id: "certificates.request.subtitle" }),
			icon: <IconPlus size={14} className="text-lime-500" />,
		});
	}

	// Prepend the None option
	if (!required) {
		options?.unshift({
			value: "0",
			label: intl.formatMessage({ id: "certificate.none.title" }),
			subLabel: forHttp
				? intl.formatMessage({ id: "certificate.none.subtitle.for-http" })
				: intl.formatMessage({ id: "certificate.none.subtitle" }),
			icon: <IconShield size={14} className="text-muted-foreground" />,
		});
	}

	return (
		<Field name={name}>
			{({ field, form }: any) => (
				<div className="mb-3 space-y-2">
					<Label htmlFor={id}>
						<T id={label} />
					</Label>
					{isLoading ? (
						<Skeleton className="h-10 w-full" />
					) : isError ? (
						<div className="text-destructive text-sm">{`${error}`}</div>
					) : (
						<Select value={getValueString(field.value)} onValueChange={handleChange}>
							<SelectTrigger
								id={id}
								className={
									form.errors[field.name] && form.touched[field.name] ? "border-destructive" : ""
								}
							>
								<SelectValue placeholder={intl.formatMessage({ id: "form.select-certificate" })} />
							</SelectTrigger>
							<SelectContent>
								{options.map((opt) => (
									<SelectItem key={opt.value} value={opt.value}>
										<div className="flex items-center gap-2">
											{opt.icon}
											<div className="flex flex-col text-left">
												<span className="font-medium">{opt.label}</span>
												<span className="text-xs text-muted-foreground">{opt.subLabel}</span>
											</div>
										</div>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					)}
					{form.errors[field.name] && form.touched[field.name] && (
						<div className="text-destructive text-sm">{form.errors[field.name]}</div>
					)}
				</div>
			)}
		</Field>
	);
}
