import { IconShieldLock } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers, type FormikProps } from "formik";
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
import { ACCESS_LIST_AUTH_TYPE, ACCESS_LIST_TAB, AUDIT_LOG_OBJECT_TYPE, UI_COLOR } from "src/types/enums";

const showAccessListModal = (id: number | "new") => {
	EasyModal.show(AccessListModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}

interface AccessListFormValues extends Partial<AccessList> {
	authType?: string;
	authentikHost?: string;
	oauth2ProxyHost?: string;
	oauth2AllowedGroups?: string;
	oauth2AllowedEmails?: string;
	oauth2AllowedEmailDomains?: string;
	oidcDiscoveryUrl?: string;
	oidcClientId?: string;
	oidcClientSecret?: string;
	mtlsEnabled?: boolean;
	mtlsContent?: string;
	mtlsUseInternal?: boolean;
}

const AccessListModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useAccessList(id, ["items", "clients"]);
	const { mutate: setAccessList } = useSetAccessList();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const validate = (values: AccessListFormValues): string | null => {
		// either Auths or Clients or SSO must be defined
		if (
			values.items?.length === 0 &&
			values.clients?.length === 0 &&
			!values.authentikHost &&
			!values.oauth2ProxyHost &&
			values.authType !== ACCESS_LIST_AUTH_TYPE.OIDC &&
			!values.mtlsEnabled
		) {
			return intl.formatMessage({ id: "error.access.at-least-one" });
		}

		if (values.authType === ACCESS_LIST_AUTH_TYPE.OIDC) {
			if (!values.oidcClientId) return "Client ID is required";
			if (!values.oidcClientSecret) return "Client Secret is required";
			if (!values.oidcDiscoveryUrl) return "Discovery URL is required";
		}

		if (values.authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY) {
			if (!values.oauth2ProxyHost) return "OAuth2 Proxy Host is required";
		}

		if (values.mtlsEnabled && !values.mtlsUseInternal && !values.mtlsContent) {
			return intl.formatMessage({ id: "error.access.mtls_content_required" });
		}

		// ensure the items don't contain the same username twice
		const usernames = (values.items || []).map((i: AccessListItem) => i.username);
		const uniqueUsernames = Array.from(new Set(usernames));
		if (usernames.length !== uniqueUsernames.length) {
			return intl.formatMessage({ id: "error.access.duplicate-usernames" });
		}

		return null;
	};

	const onSubmit = async (values: AccessListFormValues, { setSubmitting }: FormikHelpers<AccessListFormValues>) => {
		if (isSubmitting) return;

		const vErr = validate(values);
		if (vErr) {
			setErrorMsg(vErr);
			return;
		}

		setIsSubmitting(true);
		setErrorMsg(null);

		const authType = values.authType === ACCESS_LIST_AUTH_TYPE.NONE ? "" : values.authType;

		const payload: Partial<AccessList> = {
			id: id === "new" ? undefined : id,
			name: values.name,
			satisfyAny: values.satisfyAny,
			passAuth: values.passAuth,
			// mTLS
			mtlsEnabled: values.mtlsEnabled,
			mtlsUseInternal: values.mtlsUseInternal,
			mtlsCertificate: values.mtlsEnabled && !values.mtlsUseInternal ? values.mtlsContent : "",
			meta: {
				...data?.meta,
				auth_type: authType,
				authentik_host: authType === ACCESS_LIST_AUTH_TYPE.AUTHENTIK_PROXY ? values.authentikHost : undefined,
				oauth2_proxy_host: authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2ProxyHost : undefined,
				oauth2_allowed_groups:
					authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2AllowedGroups : undefined,
				oauth2_allowed_emails:
					authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2AllowedEmails : undefined,
				oauth2_allowed_email_domains:
					authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2AllowedEmailDomains : undefined,
				oidc_discovery_url: authType === ACCESS_LIST_AUTH_TYPE.OIDC ? values.oidcDiscoveryUrl : undefined,
				oidc_client_id: authType === ACCESS_LIST_AUTH_TYPE.OIDC ? values.oidcClientId : undefined,
				oidc_client_secret: authType === ACCESS_LIST_AUTH_TYPE.OIDC ? values.oidcClientSecret : undefined,
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

		setAccessList(payload as unknown as AccessList, {
			onError: (err: unknown) => setErrorMsg(typeof err === "string" ? err : (err as Error).message),
			onSuccess: () => {
				showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.ACCESS_LIST, "saved");
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
		if (!data || !data.meta) return {};
		const m = data.meta;
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
		meta.auth_type ||
		meta.authType ||
		(meta.authentik_host || meta.authentikHost
			? ACCESS_LIST_AUTH_TYPE.AUTHENTIK_PROXY
			: meta.oauth2_proxy_host || meta.oauth2ProxyHost
				? ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY
				: "");
	if (!initialAuthType) initialAuthType = ACCESS_LIST_AUTH_TYPE.NONE;

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconShieldLock className="h-5 w-5" />
						<T
							id={id === "new" ? "object.add" : "object.edit"}
							tData={{ object: AUDIT_LOG_OBJECT_TYPE.ACCESS_LIST }}
						/>
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
					<Formik<AccessListFormValues>
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
								oauth2ProxyHost: meta.oauth2_proxy_host || meta.oauth2ProxyHost || "",
								oauth2AllowedGroups: meta.oauth2_allowed_groups || meta.oauth2AllowedGroups || "",
								oauth2AllowedEmails: meta.oauth2_allowed_emails || meta.oauth2AllowedEmails || "",
								oauth2AllowedEmailDomains:
									meta.oauth2_allowed_email_domains || meta.oauth2AllowedEmailDomains || "",
								oidcDiscoveryUrl: meta.oidc_discovery_url || meta.oidcDiscoveryUrl || "",
								oidcClientId: meta.oidc_client_id || meta.oidcClientId || "",
								oidcClientSecret: meta.oidc_client_secret || meta.oidcClientSecret || "",
								// mTLS
								mtlsEnabled: !!data.mtlsEnabled,
								mtlsContent: data.mtlsCertificate || "",
								mtlsUseInternal: !!data.mtlsUseInternal,
							} as AccessListFormValues
						}
						onSubmit={onSubmit}
					>
						{({ values, setFieldValue, errors, touched }: FormikProps<AccessListFormValues>) => {
							const isSsoEnabled = !!(values.authType && values.authType !== ACCESS_LIST_AUTH_TYPE.NONE);
							return (
								<Form className="space-y-4">
									{errorMsg && (
										<Alert variant="destructive">
											<AlertCircle className="h-4 w-4" />
											<AlertTitle>Error</AlertTitle>
											<AlertDescription>{errorMsg}</AlertDescription>
										</Alert>
									)}

									<Tabs defaultValue={ACCESS_LIST_TAB.DETAILS} className="w-full">
										<TabsList className="grid w-full grid-cols-5">
											<TabsTrigger value={ACCESS_LIST_TAB.DETAILS}>
												<T id="column.details" />
											</TabsTrigger>
											<TabsTrigger value={ACCESS_LIST_TAB.AUTH}>
												<T id="column.authorizations" />
											</TabsTrigger>
											<TabsTrigger value={ACCESS_LIST_TAB.RULES}>
												<T id="column.rules" />
											</TabsTrigger>
											<TabsTrigger value={ACCESS_LIST_TAB.SSO}>
												<T id="access-list.sso" />
											</TabsTrigger>
											<TabsTrigger value={ACCESS_LIST_TAB.MTLS}>
												<T id="access-list.mtls.tab" />
											</TabsTrigger>
										</TabsList>

										<TabsContent value={ACCESS_LIST_TAB.DETAILS} className="space-y-4 pt-4">
											<div className="space-y-2">
												<Label htmlFor="name">
													<T id="column.name" />
												</Label>
												<Field name="name" validate={validateString(1, 255)}>
													{({ field }: FieldProps) => (
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
															{({ field }: FieldProps) => (
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
															{({ field }: FieldProps) => (
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

										<TabsContent value={ACCESS_LIST_TAB.AUTH} className="pt-4">
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

										<TabsContent value={ACCESS_LIST_TAB.RULES} className="pt-4">
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

										<TabsContent value={ACCESS_LIST_TAB.SSO} className="pt-4 space-y-4">
											<div className="space-y-2">
												<Label htmlFor="authType">Provider Type</Label>
												<Field name="authType">
													{({ field }: FieldProps) => (
														<Select
															value={field.value || ACCESS_LIST_AUTH_TYPE.NONE}
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
																<SelectItem value={ACCESS_LIST_AUTH_TYPE.NONE}>
																	None / Basic Auth
																</SelectItem>
																<SelectItem
																	value={ACCESS_LIST_AUTH_TYPE.AUTHENTIK_PROXY}
																>
																	Authentik Proxy (Forward Auth)
																</SelectItem>
																<SelectItem value={ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY}>
																	OAuth2 Proxy
																</SelectItem>
																<SelectItem value={ACCESS_LIST_AUTH_TYPE.OIDC}>
																	OIDC (OpenID Connect)
																</SelectItem>
															</SelectContent>
														</Select>
													)}
												</Field>
											</div>

											{values.authType === ACCESS_LIST_AUTH_TYPE.AUTHENTIK_PROXY && (
												<div className="space-y-2">
													<Label htmlFor="authentikHost">Authentik Host URL</Label>
													<Field name="authentikHost">
														{({ field }: FieldProps) => (
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

											{values.authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY && (
												<>
													<div className="space-y-2">
														<Label htmlFor="oauth2ProxyHost">OAuth2 Proxy Host URL</Label>
														<Field name="oauth2ProxyHost">
															{({ field }: FieldProps) => (
																<Input
																	{...field}
																	id="oauth2ProxyHost"
																	placeholder="http://oauth2-proxy:4180"
																/>
															)}
														</Field>
														<div className="text-sm text-muted-foreground">
															Full URL to your OAuth2 Proxy instance. Uses Nginx
															`auth_request`.
														</div>
													</div>
													<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
														<div className="space-y-2">
															<Label htmlFor="oauth2AllowedGroups">Allowed Groups</Label>
															<Field name="oauth2AllowedGroups">
																{({ field }: FieldProps) => (
																	<Input
																		{...field}
																		id="oauth2AllowedGroups"
																		placeholder="admin,dev"
																	/>
																)}
															</Field>
															<div className="text-xs text-muted-foreground">
																Comma-separated list of allowed groups.
															</div>
														</div>
														<div className="space-y-2">
															<Label htmlFor="oauth2AllowedEmails">Allowed Emails</Label>
															<Field name="oauth2AllowedEmails">
																{({ field }: FieldProps) => (
																	<Input
																		{...field}
																		id="oauth2AllowedEmails"
																		placeholder="user@example.com,user2@example.com"
																	/>
																)}
															</Field>
															<div className="text-xs text-muted-foreground">
																Comma-separated list of allowed emails.
															</div>
														</div>
														<div className="space-y-2">
															<Label htmlFor="oauth2AllowedEmailDomains">
																Allowed Domains
															</Label>
															<Field name="oauth2AllowedEmailDomains">
																{({ field }: FieldProps) => (
																	<Input
																		{...field}
																		id="oauth2AllowedEmailDomains"
																		placeholder="example.com"
																	/>
																)}
															</Field>
															<div className="text-xs text-muted-foreground">
																Comma-separated list of allowed email domains.
															</div>
														</div>
													</div>
												</>
											)}

											{values.authType === ACCESS_LIST_AUTH_TYPE.OIDC && (
												<>
													<div className="space-y-2">
														<Label htmlFor="oidcDiscoveryUrl">Discovery URL</Label>
														<Field name="oidcDiscoveryUrl">
															{({ field }: FieldProps) => (
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
															{({ field }: FieldProps) => (
																<Input {...field} id="oidcClientId" />
															)}
														</Field>
													</div>
													<div className="space-y-2">
														<Label htmlFor="oidcClientSecret">Client Secret</Label>
														<Field name="oidcClientSecret">
															{({ field }: FieldProps) => (
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
										<TabsContent value={ACCESS_LIST_TAB.MTLS} className="pt-4 space-y-4">
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
													{({ field }: FieldProps) => (
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
													{({ field }: FieldProps) => (
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
														{({ field }: FieldProps) => (
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
											className={`bg-${UI_COLOR.CYAN}-600/90 hover:bg-${UI_COLOR.CYAN}-600 text-white shadow-sm`}
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
