import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { createDdnsProvider, updateDdnsProvider, testDdnsProvider } from "src/api/backend";
import { Loading } from "src/components";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { IconWorld } from "@tabler/icons-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { getDdnsProviders } from "src/api/backend/getDdnsProviders";

const showDdnsProviderModal = (id?: number) => {
	EasyModal.show(DdnsProviderModal, { id: id || null });
};

interface Props extends InnerModalProps {
	id?: number | null;
	visible: boolean;
	remove: () => void;
}

const DdnsProviderModal = EasyModal.create(({ id, visible, remove }: Props) => {
	// If ID is provided, fetch existing data to edit locally or use a hook
	const { data: providers, isLoading } = useQuery({
		queryKey: ["ddns-providers"],
		queryFn: getDdnsProviders,
		enabled: !!id,
	});

	const data = id ? providers?.find((p) => p.id === id) : null;
	const isEditing = !!id;

	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isTesting, setIsTesting] = useState(false);
	const [testResult, setTestResult] = useState<string | null>(null);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;

		setIsSubmitting(true);
		setErrorMsg(null);

		// Prepare config based on provider
		let config: any = {};
		if (values.provider === "cloudflare") {
			config = { token: values.cloudfare_token, zone_id: values.cloudfare_zone_id };
		} else if (values.provider === "duckdns") {
			config = { token: values.duckdns_token };
		} else if (values.provider === "custom") {
			config = { url: values.custom_url };
		}

		// Split domains by comma or space
		const domains = values.domainsStr.split(/[\s,]+/).filter((d: string) => d.trim().length > 0);

		const payload: any = {
			name: values.name,
			provider: values.provider,
			domains,
			config,
			enabled: true, // Always enable on create/update for now
		};

		try {
			if (isEditing && id) {
				await updateDdnsProvider(id, payload);
				showObjectSuccess("ddns-provider", "saved");
			} else {
				await createDdnsProvider(payload);
				showObjectSuccess("ddns-provider", "created");
			}
			remove();
		} catch (err: any) {
			setErrorMsg(typeof err === "string" ? err : err.message);
		} finally {
			setIsSubmitting(false);
			setSubmitting(false);
		}
	};

	const handleTest = async () => {
		if (!id) return;
		setIsTesting(true);
		setTestResult(null);
		try {
			const res = await testDdnsProvider(id);
			setTestResult(`Success: IPs ${JSON.stringify(res.ips)}`);
		} catch (err: any) {
			setTestResult(`Error: ${err.message}`);
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
					<Formik
						enableReinitialize
						initialValues={{
							name: data?.name || "",
							provider: data?.provider || "cloudflare",
							domainsStr: data?.domains.join(", ") || "",
							// Cloudflare
							cloudfare_token: data?.config?.token || "",
							cloudfare_zone_id: data?.config?.zone_id || "",
							// DuckDNS
							duckdns_token: data?.config?.token || "",
							// Custom
							custom_url: data?.config?.url || "",
						}}
						onSubmit={onSubmit}
					>
						{({ values, setFieldValue }: any) => (
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
										{({ field }: any) => <Input {...field} id="name" placeholder="My DDNS" />}
									</Field>
								</div>

								<div className="space-y-2">
									<Label htmlFor="provider">
										<T id="ddns-providers.provider" />
									</Label>
									<Field name="provider">
										{({ field }: any) => (
											<Select
												value={field.value}
												onValueChange={(val) => setFieldValue("provider", val)}
											>
												<SelectTrigger id="provider">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectItem value="cloudflare">Cloudflare</SelectItem>
													<SelectItem value="duckdns">DuckDNS</SelectItem>
													<SelectItem value="custom">Custom (Webhook)</SelectItem>
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
										{({ field }: any) => (
											<Input
												{...field}
												id="domainsStr"
												placeholder="sub.example.com, sub2.example.com"
											/>
										)}
									</Field>
									<div className="text-xs text-muted-foreground">Comma separated</div>
								</div>

								<div className="border border-dashed p-4 rounded-md space-y-4">
									<h3 className="font-medium text-sm">
										<T id="ddns-providers.config" />
									</h3>

									{values.provider === "cloudflare" && (
										<>
											<div className="space-y-2">
												<Label htmlFor="cloudfare_token">
													<T id="ddns-providers.cloudfare_token" />
												</Label>
												<Field name="cloudfare_token">
													{({ field }: any) => (
														<Input {...field} type="password" id="cloudfare_token" />
													)}
												</Field>
											</div>
											<div className="space-y-2">
												<Label htmlFor="cloudfare_zone_id">
													<T id="ddns-providers.cloudfare_zone_id" />
												</Label>
												<Field name="cloudfare_zone_id">
													{({ field }: any) => <Input {...field} id="cloudfare_zone_id" />}
												</Field>
											</div>
										</>
									)}

									{values.provider === "duckdns" && (
										<div className="space-y-2">
											<Label htmlFor="duckdns_token">
												<T id="ddns-providers.duckdns_token" />
											</Label>
											<Field name="duckdns_token">
												{({ field }: any) => (
													<Input {...field} type="password" id="duckdns_token" />
												)}
											</Field>
										</div>
									)}

									{values.provider === "custom" && (
										<div className="space-y-2">
											<Label htmlFor="custom_url">
												<T id="ddns-providers.custom_url" />
											</Label>
											<Field name="custom_url">
												{({ field }: any) => (
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
