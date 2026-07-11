import { IconShieldLock } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik, type FormikHelpers, type FormikProps } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { AccessList, AccessListClient, AccessListItem } from "src/api/backend";
import { Loading } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { useAccessList, useSetAccessList } from "src/hooks";
import { intl, T } from "src/locale";
import { showObjectSuccess } from "src/notifications";
import { ACCESS_LIST_AUTH_TYPE, ACCESS_LIST_TAB, AUDIT_LOG_OBJECT_TYPE, UI_COLOR } from "src/types/enums";
import AccessListAuthorizationTabs from "./AccessListAuthorizationTabs";
import AccessListDetailsTab from "./AccessListDetailsTab";
import AccessListMtlsTab from "./AccessListMtlsTab";
import AccessListSsoTab from "./AccessListSsoTab";

const showAccessListModal = (id: number | "new") => {
	EasyModal.show(AccessListModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}

interface AccessListFormValues extends Partial<AccessList> {
	authType?: string;
	authentikHost?: string;
	oauth2ProxyHost?: string; // Still used? Removed in favor of managed process
	oauth2Provider?: string;
	oauth2ClientId?: string;
	oauth2ClientSecret?: string;
	oauth2CookieSecret?: string;
	oauth2OidcIssuerUrl?: string;
	oauth2ProxyPrefix?: string;
	oauth2Scope?: string;
	oauth2AllowedGroups?: string;
	oauth2AllowedEmails?: string;
	oauth2AllowedEmailDomains?: string;
	oauth2InsecureOidcAllowUnverifiedEmail?: boolean;
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
			values.authType !== ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY &&
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
			if (!values.oauth2ClientId) return "Client ID is required";
			if (!values.oauth2ClientSecret) return "Client Secret is required";
			if (!values.oauth2CookieSecret) return "Cookie Secret is required";
			if (values.oauth2Provider === "oidc" && !values.oauth2OidcIssuerUrl)
				return "OIDC Issuer URL is required for OIDC provider";
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
				// oauth2_proxy_host is removed as we manage it locally
				oauth2_provider: authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2Provider : undefined,
				oauth2_client_id: authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2ClientId : undefined,
				oauth2_client_secret:
					authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2ClientSecret : undefined,
				oauth2_cookie_secret:
					authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2CookieSecret : undefined,
				oauth2_oidc_issuer_url:
					authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2OidcIssuerUrl : undefined,
				oauth2_proxy_prefix:
					authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2ProxyPrefix : undefined,
				oauth2_scope: authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2Scope : undefined,
				oauth2_allowed_groups:
					authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2AllowedGroups : undefined,
				oauth2_allowed_emails:
					authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2AllowedEmails : undefined,
				oauth2_allowed_email_domains:
					authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY ? values.oauth2AllowedEmailDomains : undefined,
				oauth2_insecure_oidc_allow_unverified_email:
					authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY
						? values.oauth2InsecureOidcAllowUnverifiedEmail
						: undefined,
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
		if (!data?.meta) return {};
		const m = data.meta;
		if (typeof m === "string") {
			try {
				return JSON.parse(m) || {};
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
								oauth2Provider: meta.oauth2_provider || meta.oauth2Provider || "google",
								oauth2ClientId: meta.oauth2_client_id || meta.oauth2ClientId || "",
								oauth2ClientSecret: meta.oauth2_client_secret || meta.oauth2ClientSecret || "",
								oauth2CookieSecret: meta.oauth2_cookie_secret || meta.oauth2CookieSecret || "",
								oauth2OidcIssuerUrl: meta.oauth2_oidc_issuer_url || meta.oauth2OidcIssuerUrl || "",
								oauth2ProxyPrefix: meta.oauth2_proxy_prefix || meta.oauth2ProxyPrefix || "/oauth2/",
								oauth2Scope: meta.oauth2_scope || meta.oauth2Scope || "",
								oauth2AllowedGroups: meta.oauth2_allowed_groups || meta.oauth2AllowedGroups || "",
								oauth2AllowedEmails: meta.oauth2_allowed_emails || meta.oauth2AllowedEmails || "",
								oauth2AllowedEmailDomains:
									meta.oauth2_allowed_email_domains || meta.oauth2AllowedEmailDomains || "",
								oauth2InsecureOidcAllowUnverifiedEmail: !!(
									meta.oauth2_insecure_oidc_allow_unverified_email ||
									meta.oauth2InsecureOidcAllowUnverifiedEmail
								),
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
						{({ values }: FormikProps<AccessListFormValues>) => {
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

										<AccessListDetailsTab />

										<AccessListAuthorizationTabs
											clients={data?.clients || []}
											isSsoEnabled={isSsoEnabled}
											items={data?.items || []}
										/>
										<AccessListSsoTab />

										<AccessListMtlsTab />
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
