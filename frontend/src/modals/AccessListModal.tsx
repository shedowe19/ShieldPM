import { IconShieldLock } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { AlertCircle, AlertTriangle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { AccessList, AccessListClient, AccessListItem } from "src/api/backend";
import { AccessClientFields, BasicAuthFields, Loading } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Switch } from "src/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { Textarea } from "src/components/ui/textarea";
import { useAccessList, useSetAccessList } from "src/hooks";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showAccessListModal = (id: number | "new") => {
	EasyModal.show(AccessListModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}

const AccessListModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useAccessList(id, ["items", "clients"]);
	const { mutate: setAccessList } = useSetAccessList();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [activeTab, setActiveTab] = useState("details");

	const validate = (values: any): string | null => {
		// either Auths or Clients or SSO must be defined
		if (
			values.items?.length === 0 &&
			values.clients?.length === 0 &&
			!values.authentikHost &&
			values.authType !== "oidc" &&
			!values.mtlsEnabled
		) {
			return intl.formatMessage({ id: "error.access.at-least-one" });
		}

		if (values.authType === "oidc") {
			if (!values.oidcClientId) return "Client ID is required";
			if (!values.oidcClientSecret) return "Client Secret is required";
			if (!values.oidcDiscoveryUrl) return "Discovery URL is required";
		}

		if (values.mtlsEnabled && !values.mtlsUseInternal && !values.mtlsContent) {
			return intl.formatMessage({ id: "error.access.mtls_content_required" });
		}

		// ensure the items don't contain the same username twice
		const usernames = values.items.map((i: any) => i.username);
		const uniqueUsernames = Array.from(new Set(usernames));
		if (usernames.length !== uniqueUsernames.length) {
			return intl.formatMessage({ id: "error.access.duplicate-usernames" });
		}

		return null;
	};

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;

		const vErr = validate(values);
		if (vErr) {
			setErrorMsg(vErr);
			return;
		}

		setIsSubmitting(true);
		setErrorMsg(null);

		const authType = values.authType === "none" ? "" : values.authType;

		const payload: any = {
			id: id === "new" ? undefined : id,
			name: values.name,
			satisfy_any: values.satisfyAny,
			pass_auth: values.passAuth,
			// mTLS
			mtls_enabled: values.mtlsEnabled,
			mtls_use_internal: values.mtlsUseInternal,
			mtls_certificate: values.mtlsEnabled && !values.mtlsUseInternal ? values.mtlsContent : "",
			meta: {
				...data?.meta,
				auth_type: authType,
				authentik_host: authType === "authentik_proxy" ? values.authentikHost : undefined,
				oidc_discovery_url: authType === "oidc" ? values.oidcDiscoveryUrl : undefined,
				oidc_client_id: authType === "oidc" ? values.oidcClientId : undefined,
				oidc_client_secret: authType === "oidc" ? values.oidcClientSecret : undefined,
			},
		};

		// Filter out "items" to only use the "username" and "password" fields
		payload.items = (values.items || []).map((i: AccessListItem) => ({
			username: i.username,
			password: i.password,
		}));

		// Filter out "clients" to only use the "directive" and "address" fields
		payload.clients = (values.clients || []).map((i: AccessListClient) => ({
			directive: i.directive,
			address: i.address,
		}));

		setAccessList(payload, {
			onError: (err: any) => setErrorMsg(typeof err === "string" ? err : err.message),
			onSuccess: () => {
				showObjectSuccess("access-list", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	// Robustly parse meta (handle stringified JSON if necessary)
	const meta = (() => {
		if (!data || !(data as any).meta) return {};
		const m = (data as any).meta;
		if (typeof m === "string") {
			try {
				return JSON.parse(m);
			} catch (e) {
				console.error("Failed to parse access list meta:", e);
				return {};
			}
		}
		return m;
	})();

	let initialAuthType =
		meta.auth_type || meta.authType || (meta.authentik_host || meta.authentikHost ? "authentik_proxy" : "");
	if (!initialAuthType) initialAuthType = "none";

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconShieldLock className="h-5 w-5" />
						<T id={id === "new" ? "object.add" : "object.edit"} tData={{ object: "access-list" }} />
					</DialogTitle>
				</DialogHeader>

				{!isLoading && error && (
					<Alert variant="destructive" className="mb-4">
						<AlertCircle className="h-4 w-4" />
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{error?.message || "Unknown error"}</AlertDescription>
					</Alert>
				)}

				{isLoading && <Loading noLogo />}

				{!isLoading && data && (
					<Formik
						enableReinitialize
						initialValues={
							{
								name: data?.name,
								satisfyAny: data?.satisfyAny,
								passAuth: data?.passAuth,
								items: data?.items || [],
								clients: data?.clients || [],
								// Determine initial authType
								authType: initialAuthType,
								authentikHost: meta.authentik_host || meta.authentikHost || "",
								oidcDiscoveryUrl: meta.oidc_discovery_url || meta.oidcDiscoveryUrl || "",
								oidcClientId: meta.oidc_client_id || meta.oidcClientId || "",
								oidcClientSecret: meta.oidc_client_secret || meta.oidcClientSecret || "",
								// mTLS
								mtlsEnabled: !!data.mtlsEnabled,
								mtlsContent: data.mtlsCertificate || "",
								mtlsUseInternal: !!data.mtlsUseInternal,
							} as AccessList & {
								authType: string;
								authentikHost: string;
								oidcDiscoveryUrl: string;
								oidcClientId: string;
								oidcClientSecret: string;
								mtlsEnabled: boolean;
								mtlsContent: string;
								mtlsUseInternal: boolean;
							}
						}
						onSubmit={onSubmit}
					>
						{({ values, setFieldValue, errors, touched }: any) => {
							const isSsoEnabled = values.authType && values.authType !== "none";
							return (
								<Form className="space-y-4">
									{errorMsg && (
										<Alert variant="destructive">
											<AlertCircle className="h-4 w-4" />
											<AlertTitle>Error</AlertTitle>
											<AlertDescription>{errorMsg}</AlertDescription>
										</Alert>
									)}

									<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
										<TabsList className="grid w-full grid-cols-5">
											<TabsTrigger value="details">
												<T id="column.details" />
											</TabsTrigger>
											<TabsTrigger value="auth">
												<T id="column.authorizations" />
											</TabsTrigger>
											<TabsTrigger value="rules">
												<T id="column.rules" />
											</TabsTrigger>
											<TabsTrigger value="sso">
												<T id="access-list.sso" />
											</TabsTrigger>
											<TabsTrigger value="mtls">
												<T id="access-list.mtls.tab" />
											</TabsTrigger>
										</TabsList>

										<TabsContent value="details" className="space-y-4 pt-4">
											<div className="space-y-2">
												<Label htmlFor="name">
													<T id="column.name" />
												</Label>
												<Field name="name" validate={validateString(1, 255)}>
													{({ field }: any) => (
														<Input
															{...field}
															id="name"
															autoComplete="off"
															className={
																errors.name && touched.name ? "border-destructive" : ""
															}
														/>
													)}
												</Field>
												{errors.name && touched.name && (
													<div className="text-sm text-destructive">{errors.name}</div>
												)}
											</div>

											<Card className="border-dashed">
												<CardContent className="p-4 space-y-4">
													<h3 className="font-medium">
														<T id="options" />
													</h3>
													<div className="flex items-center justify-between">
														<Label htmlFor="satisfyAny" className="cursor-pointer">
															<T id="access-list.satisfy-any" />
														</Label>
														<Field name="satisfyAny">
															{({ field }: any) => (
																<Switch
																	id="satisfyAny"
																	checked={field.value}
																	onCheckedChange={(checked) =>
																		setFieldValue("satisfyAny", checked)
																	}
																/>
															)}
														</Field>
													</div>
													<div className="flex items-center justify-between">
														<Label htmlFor="passAuth" className="cursor-pointer">
															<T id="access-list.pass-auth" />
														</Label>
														<Field name="passAuth">
															{({ field }: any) => (
																<Switch
																	id="passAuth"
																	checked={field.value}
																	onCheckedChange={(checked) =>
																		setFieldValue("passAuth", checked)
																	}
																/>
															)}
														</Field>
													</div>
												</CardContent>
											</Card>
										</TabsContent>

										<TabsContent value="auth" className="pt-4">
											{isSsoEnabled && (
												<Alert variant="default" className="mb-4 bg-muted border-primary/20">
													<AlertTriangle className="h-4 w-4 text-primary" />
													<AlertDescription>
														Authentication handled by SSO Provider.
													</AlertDescription>
												</Alert>
											)}
											<fieldset
												disabled={isSsoEnabled}
												className={isSsoEnabled ? "opacity-50" : ""}
											>
												<BasicAuthFields initialValues={data?.items || []} />
											</fieldset>
										</TabsContent>

										<TabsContent value="rules" className="pt-4">
											{isSsoEnabled && (
												<Alert variant="default" className="mb-4 bg-muted border-primary/20">
													<AlertTriangle className="h-4 w-4 text-primary" />
													<AlertDescription>
														Access Rules handled by SSO Provider.
													</AlertDescription>
												</Alert>
											)}
											<fieldset
												disabled={isSsoEnabled}
												className={isSsoEnabled ? "opacity-50" : ""}
											>
												<AccessClientFields initialValues={data?.clients || []} />
											</fieldset>
										</TabsContent>

										<TabsContent value="sso" className="pt-4 space-y-4">
											<div className="space-y-2">
												<Label htmlFor="authType">Provider Type</Label>
												<Field name="authType">
													{({ field }: any) => (
														<Select
															value={field.value || "none"}
															onValueChange={(val) => setFieldValue("authType", val)}
														>
															<SelectTrigger id="authType">
																<SelectValue
																	placeholder={intl.formatMessage({
																		id: "access-list.satisfy.none",
																	})}
																/>
															</SelectTrigger>
															<SelectContent>
																<SelectItem value="none">None / Basic Auth</SelectItem>
																<SelectItem value="authentik_proxy">
																	Authentik Proxy (Forward Auth)
																</SelectItem>
																<SelectItem value="oidc">
																	OIDC (OpenID Connect)
																</SelectItem>
															</SelectContent>
														</Select>
													)}
												</Field>
											</div>

											{values.authType === "authentik_proxy" && (
												<div className="space-y-2">
													<Label htmlFor="authentikHost">Authentik Host URL</Label>
													<Field name="authentikHost">
														{({ field }: any) => (
															<Input
																{...field}
																id="authentikHost"
																placeholder={intl.formatMessage({
																	id: "form.placeholder.auth-host",
																})}
															/>
														)}
													</Field>
													<div className="text-sm text-muted-foreground">
														Full URL to your Authentik instance. Uses Nginx `auth_request`
														to the Outpost.
													</div>
												</div>
											)}

											{values.authType === "oidc" && (
												<>
													<div className="space-y-2">
														<Label htmlFor="oidcDiscoveryUrl">Discovery URL</Label>
														<Field name="oidcDiscoveryUrl">
															{({ field }: any) => (
																<Input
																	{...field}
																	id="oidcDiscoveryUrl"
																	placeholder="https://authentik.company/.well-known/openid-configuration"
																/>
															)}
														</Field>
													</div>
													<div className="space-y-2">
														<Label htmlFor="oidcClientId">Client ID</Label>
														<Field name="oidcClientId">
															{({ field }: any) => <Input {...field} id="oidcClientId" />}
														</Field>
													</div>
													<div className="space-y-2">
														<Label htmlFor="oidcClientSecret">Client Secret</Label>
														<Field name="oidcClientSecret">
															{({ field }: any) => (
																<Input
																	{...field}
																	type="password"
																	id="oidcClientSecret"
																/>
															)}
														</Field>
													</div>
												</>
											)}
										</TabsContent>

										{/* mTLS Tab */}
										<TabsContent value="mtls" className="pt-4 space-y-4">
											<div className="flex items-center justify-between">
												<div className="space-y-0.5">
													<Label htmlFor="mtlsEnabled" className="text-base">
														<T id="access-list.mtls.enable" />
													</Label>
													<p className="text-sm text-muted-foreground">
														<T id="access-list.mtls.enable_desc" />
													</p>
												</div>
												<Field name="mtlsEnabled">
													{({ field }: any) => (
														<Switch
															id="mtlsEnabled"
															checked={field.value}
															onCheckedChange={(checked) =>
																setFieldValue("mtlsEnabled", checked)
															}
														/>
													)}
												</Field>
											</div>

											<div className="flex items-center justify-between mt-4">
												<div className="space-y-0.5">
													<Label htmlFor="mtlsUseInternal" className="text-base">
														<T id="access-list.mtls.use_internal" />
													</Label>
													<p className="text-sm text-muted-foreground">
														<T id="access-list.mtls.use_internal_desc" />
													</p>
												</div>
												<Field name="mtlsUseInternal">
													{({ field }: any) => (
														<Switch
															id="mtlsUseInternal"
															checked={field.value}
															onCheckedChange={(checked) =>
																setFieldValue("mtlsUseInternal", checked)
															}
														/>
													)}
												</Field>
											</div>

											{values.mtlsEnabled && !values.mtlsUseInternal && (
												<div className="space-y-2">
													<Label htmlFor="mtlsContent">
														<T id="access-list.mtls.certificate" />
													</Label>
													<Field name="mtlsContent">
														{({ field }: any) => (
															<Textarea
																{...field}
																id="mtlsContent"
																placeholder={intl.formatMessage({
																	id: "access-list.mtls.certificate.placeholder",
																})}
																className="font-mono text-xs h-64"
															/>
														)}
													</Field>
													<div className="text-sm text-muted-foreground">
														<T id="access-list.mtls.certificate_desc" />
													</div>
												</div>
											)}
										</TabsContent>
									</Tabs>

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
							);
						}}
					</Formik>
				)}
			</DialogContent>
		</Dialog>
	);
});

export { showAccessListModal };
