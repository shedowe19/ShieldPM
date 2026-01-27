import { IconWorld } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { createDdnsProvider, type DdnsProvider, testDdnsProvider, updateDdnsProvider } from "src/api/backend";
import { getDdnsProviders } from "src/api/backend/getDdnsProviders";
import { Loading } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import { DdnsProviderName, IpVersion } from "src/types/enums";

const showDdnsProviderModal = (id?: number) => {
	EasyModal.show(DdnsProviderModal, { id: id || "new" });
};

interface Props extends InnerModalProps {
	id: number | "new";
	visible: boolean;
	remove: () => void;
}

interface DdnsProviderValues {
	name: string;
	provider: DdnsProviderName;
	ip_ver: IpVersion;
	domainsStr: string;
	// Cloudflare
	cloudfare_token: string;
	cloudfare_zone_id: string;
	// DuckDNS
	duckdns_token: string;
	// Custom
	custom_url: string;
}

const DdnsProviderModal = EasyModal.create(({ id, visible, remove }: Props) => {
	// If ID is provided, fetch existing data to edit locally or use a hook
	const { data: providers, isLoading } = useQuery({
		queryKey: ["ddns-providers"],
		queryFn: getDdnsProviders,
		enabled: id !== "new",
	});

	const data = id && id !== "new" ? providers?.find((p) => p.id === id) : null;
	const isEditing = id !== "new";
	const queryClient = useQueryClient();

	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isTesting, setIsTesting] = useState(false);
	const [testResult, setTestResult] = useState<string | null>(null);

	const onSubmit = async (values: DdnsProviderValues, { setSubmitting }: FormikHelpers<DdnsProviderValues>) => {
		if (isSubmitting) return;

		setIsSubmitting(true);
		setErrorMsg(null);

		// Prepare config based on provider
		let config: Record<string, unknown> = {};
		if (values.provider === DdnsProviderName.Cloudflare) {
			config = { token: values.cloudfare_token, zone_id: values.cloudfare_zone_id };
		} else if (values.provider === DdnsProviderName.DuckDNS) {
			config = { token: values.duckdns_token };
		} else if (values.provider === DdnsProviderName.Custom) {
			config = { url: values.custom_url };
		}

		// Split domains by comma or space
		const domains = values.domainsStr.split(/[\s,]+/).filter((d: string) => d.trim().length > 0);

		const payload: Partial<DdnsProvider> = {
			name: values.name,
			provider: values.provider,
			ip_ver: values.ip_ver,
			domains,
			config,
			enabled: true, // Always enable on create/update for now
		};

		try {
			if (typeof id === "number") {
				await updateDdnsProvider(id, payload);
				showObjectSuccess("ddns-provider", "saved");
			} else {
				await createDdnsProvider(payload);
				showObjectSuccess("ddns-provider", "created");
			}
			queryClient.invalidateQueries({ queryKey: ["ddns-providers"] });
			remove();
		} catch (err) {
			if (err instanceof Error) setErrorMsg(err.message);
		} finally {
			setIsSubmitting(false);
			setSubmitting(false);
		}
	};

	const handleTest = async () => {
		if (typeof id !== "number") return;
		setIsTesting(true);
		setTestResult(null);
		try {
			const res = (await testDdnsProvider(id)) as { ips: string[] };
			setTestResult(`Success: IPs ${JSON.stringify(res.ips)}`);
		} catch (err) {
			if (err instanceof Error) setTestResult(`Error: ${err.message}`);
		} finally {
			setIsTesting(false);
		}
	};

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconWorld className="h-5 w-5" />
						<T id={isEditing ? "ddns-providers.edit" : "ddns-providers.add"} />
					</DialogTitle>
				</DialogHeader>

				{isLoading && isEditing ? (
					<Loading noLogo />
				) : (
					<Formik<DdnsProviderValues>
						enableReinitialize
						initialValues={{
							name: data?.name || "",
							provider: (data?.provider as DdnsProviderName) || DdnsProviderName.Cloudflare,
							ip_ver: (data?.ip_ver as IpVersion) || IpVersion.Dual,
							domainsStr: data?.domains.join(", ") || "",
							// Cloudflare
							cloudfare_token: (data?.config as { token?: string })?.token || "",
							cloudfare_zone_id: (data?.config as { zone_id?: string })?.zone_id || "",
							// DuckDNS
							duckdns_token: (data?.config as { token?: string })?.token || "",
							// Custom
							custom_url: (data?.config as { url?: string })?.url || "",
						}}
						onSubmit={onSubmit}
					>
						{({ values, setFieldValue }) => (
							<Form className="space-y-4">
								{errorMsg && (
									<Alert variant="destructive">
										<AlertCircle className="h-4 w-4" />
										<AlertTitle>Error</AlertTitle>
										<AlertDescription>{errorMsg}</AlertDescription>
									</Alert>
								)}

								<div className="space-y-2">
									<Label htmlFor="name">
										<T id="column.name" />
									</Label>
									<Field name="name" validate={validateString(1, 50)}>
										{({ field }: FieldProps) => (
											<Input {...field} id="name" placeholder="My DDNS" />
										)}
									</Field>
								</div>

								<div className="space-y-2">
									<Label htmlFor="provider">
										<T id="ddns-providers.provider" />
									</Label>
									<Field name="provider">
										{({ field }: FieldProps) => (
											<Select
												value={field.value}
												onValueChange={(val) => setFieldValue("provider", val)}
											>
												<SelectTrigger id="provider">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={DdnsProviderName.Cloudflare}>
														Cloudflare
													</SelectItem>
													<SelectItem value={DdnsProviderName.DuckDNS}>DuckDNS</SelectItem>
													<SelectItem value={DdnsProviderName.Custom}>
														Custom (Webhook)
													</SelectItem>
												</SelectContent>
											</Select>
										)}
									</Field>
								</div>

								<div className="space-y-2">
									<Label htmlFor="domainsStr">
										<T id="ddns-providers.domains" />
									</Label>
									<Field name="domainsStr">
										{({ field }: FieldProps) => (
											<Input
												{...field}
												id="domainsStr"
												placeholder="sub.example.com, sub2.example.com"
											/>
										)}
									</Field>
									<div className="text-xs text-muted-foreground">Comma separated</div>
								</div>

								<div className="space-y-2">
									<Label htmlFor="ip_ver">
										<T id="ddns-providers.ip-ver" />
									</Label>
									<Field name="ip_ver">
										{({ field }: FieldProps) => (
											<Select
												value={field.value}
												onValueChange={(val) => setFieldValue("ip_ver", val)}
											>
												<SelectTrigger id="ip_ver">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value={IpVersion.Dual}>
														<T id="ddns-providers.ip-ver.dual" />
													</SelectItem>
													<SelectItem value={IpVersion.V4}>
														<T id="ddns-providers.ip-ver.v4" />
													</SelectItem>
													<SelectItem value={IpVersion.V6}>
														<T id="ddns-providers.ip-ver.v6" />
													</SelectItem>
												</SelectContent>
											</Select>
										)}
									</Field>
								</div>

								<div className="border border-dashed p-4 rounded-md space-y-4">
									<h3 className="font-medium text-sm">
										<T id="ddns-providers.config" />
									</h3>

									{values.provider === DdnsProviderName.Cloudflare && (
										<>
											<div className="space-y-2">
												<Label htmlFor="cloudfare_token">
													<T id="ddns-providers.cloudfare_token" />
												</Label>
												<Field name="cloudfare_token">
													{({ field }: FieldProps) => (
														<Input {...field} type="password" id="cloudfare_token" />
													)}
												</Field>
											</div>
											<div className="space-y-2">
												<Label htmlFor="cloudfare_zone_id">
													<T id="ddns-providers.cloudfare_zone_id" />
												</Label>
												<Field name="cloudfare_zone_id">
													{({ field }: FieldProps) => (
														<Input {...field} id="cloudfare_zone_id" />
													)}
												</Field>
											</div>
										</>
									)}

									{values.provider === DdnsProviderName.DuckDNS && (
										<div className="space-y-2">
											<Label htmlFor="duckdns_token">
												<T id="ddns-providers.duckdns_token" />
											</Label>
											<Field name="duckdns_token">
												{({ field }: FieldProps) => (
													<Input {...field} type="password" id="duckdns_token" />
												)}
											</Field>
										</div>
									)}

									{values.provider === DdnsProviderName.Custom && (
										<div className="space-y-2">
											<Label htmlFor="custom_url">
												<T id="ddns-providers.custom_url" />
											</Label>
											<Field name="custom_url">
												{({ field }: FieldProps) => (
													<Input
														{...field}
														id="custom_url"
														placeholder={intl.formatMessage({
															id: "ddns-providers.custom_url.placeholder",
														})}
													/>
												)}
											</Field>
											<div className="text-xs text-muted-foreground">
												Supports &#123;IP&#125;, &#123;IPv4&#125;, &#123;IPv6&#125;,
												&#123;DOMAIN&#125;
											</div>
										</div>
									)}
								</div>

								{isEditing && (
									<div className="flex items-center gap-4 border-t pt-4">
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={handleTest}
											disabled={isTesting}
										>
											{isTesting ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
											<T id="ddns-providers.test" />
										</Button>
										{testResult && <span className="text-xs font-mono">{testResult}</span>}
									</div>
								)}

								<DialogFooter>
									<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
										<T id="cancel" />
									</Button>
									<Button
										type="submit"
										disabled={isSubmitting}
										className="bg-cyan-600/90 hover:bg-cyan-600 text-white shadow-sm"
									>
										{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
										<T id="save" />
									</Button>
								</DialogFooter>
							</Form>
						)}
					</Formik>
				)}
			</DialogContent>
		</Dialog>
	);
});

export { showDdnsProviderModal };
