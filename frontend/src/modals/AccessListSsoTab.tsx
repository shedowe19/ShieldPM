import { Field, type FieldProps, useFormikContext } from "formik";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Switch } from "src/components/ui/switch";
import { TabsContent } from "src/components/ui/tabs";
import { intl } from "src/locale";
import { ACCESS_LIST_AUTH_TYPE, ACCESS_LIST_TAB } from "src/types/enums";

type AccessListSsoFormValues = {
	authType?: string;
	authentikHost?: string;
	oauth2AllowedEmailDomains?: string;
	oauth2AllowedEmails?: string;
	oauth2AllowedGroups?: string;
	oauth2ClientId?: string;
	oauth2ClientSecret?: string;
	oauth2CookieSecret?: string;
	oauth2InsecureOidcAllowUnverifiedEmail?: boolean;
	oauth2OidcIssuerUrl?: string;
	oauth2Provider?: string;
	oauth2ProxyPrefix?: string;
	oauth2Scope?: string;
	oidcClientId?: string;
	oidcClientSecret?: string;
	oidcDiscoveryUrl?: string;
};

const AccessListSsoTab = () => {
	const { setFieldValue, values } = useFormikContext<AccessListSsoFormValues>();

	return (
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
								<SelectValue placeholder={intl.formatMessage({ id: "access-list.satisfy.none" })} />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value={ACCESS_LIST_AUTH_TYPE.NONE}>None / Basic Auth</SelectItem>
								<SelectItem value={ACCESS_LIST_AUTH_TYPE.AUTHENTIK_PROXY}>
									Authentik Proxy (Forward Auth)
								</SelectItem>
								<SelectItem value={ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY}>OAuth2 Proxy</SelectItem>
								<SelectItem value={ACCESS_LIST_AUTH_TYPE.OIDC}>OIDC (OpenID Connect)</SelectItem>
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
								placeholder={intl.formatMessage({ id: "form.placeholder.auth-host" })}
							/>
						)}
					</Field>
					<div className="text-sm text-muted-foreground">
						Full URL to your Authentik instance. Uses Nginx `auth_request` to the Outpost.
					</div>
				</div>
			)}

			{values.authType === ACCESS_LIST_AUTH_TYPE.OAUTH2_PROXY && (
				<>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="oauth2Provider">Provider</Label>
							<Field name="oauth2Provider">
								{({ field }: FieldProps) => (
									<Select
										value={field.value || "google"}
										onValueChange={(val) => setFieldValue("oauth2Provider", val)}
									>
										<SelectTrigger id="oauth2Provider">
											<SelectValue placeholder="Select Provider" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="google">Google</SelectItem>
											<SelectItem value="github">GitHub</SelectItem>
											<SelectItem value="oidc">OpenID Connect</SelectItem>
											<SelectItem value="azure">Azure</SelectItem>
											<SelectItem value="gitlab">GitLab</SelectItem>
											<SelectItem value="keycloak-oidc">Keycloak</SelectItem>
										</SelectContent>
									</Select>
								)}
							</Field>
						</div>
						<div className="space-y-2">
							<Label htmlFor="oauth2ProxyPrefix">Proxy Prefix</Label>
							<Field name="oauth2ProxyPrefix">
								{({ field }: FieldProps) => (
									<Input {...field} id="oauth2ProxyPrefix" placeholder="/oauth2/" />
								)}
							</Field>
						</div>
					</div>

					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="oauth2ClientId">Client ID</Label>
							<Field name="oauth2ClientId">
								{({ field }: FieldProps) => <Input {...field} id="oauth2ClientId" />}
							</Field>
						</div>
						<div className="space-y-2">
							<Label htmlFor="oauth2ClientSecret">Client Secret</Label>
							<Field name="oauth2ClientSecret">
								{({ field }: FieldProps) => (
									<Input {...field} type="password" id="oauth2ClientSecret" />
								)}
							</Field>
						</div>
					</div>

					<div className="space-y-2">
						<Label htmlFor="oauth2CookieSecret">Cookie Secret</Label>
						<div className="flex gap-2">
							<Field name="oauth2CookieSecret">
								{({ field }: FieldProps) => (
									<Input
										{...field}
										type="password"
										id="oauth2CookieSecret"
										placeholder="16, 24, or 32 bytes"
									/>
								)}
							</Field>
						</div>
						<div className="text-xs text-muted-foreground">Must be 16, 24, or 32 bytes.</div>
					</div>

					{values.oauth2Provider === "oidc" && (
						<div className="space-y-2">
							<Label htmlFor="oauth2OidcIssuerUrl">OIDC Issuer URL</Label>
							<Field name="oauth2OidcIssuerUrl">
								{({ field }: FieldProps) => (
									<Input
										{...field}
										id="oauth2OidcIssuerUrl"
										placeholder="https://accounts.google.com"
									/>
								)}
							</Field>
						</div>
					)}

					<div className="space-y-2">
						<Label htmlFor="oauth2Scope">Scope</Label>
						<Field name="oauth2Scope">
							{({ field }: FieldProps) => (
								<Input {...field} id="oauth2Scope" placeholder="openid profile email" />
							)}
						</Field>
						<div className="text-sm text-muted-foreground">
							OAuth scopes (space separated). Leave empty for defaults.
						</div>
					</div>

					<div className="space-y-2">
						<div className="flex items-center justify-between">
							<Label htmlFor="oauth2InsecureOidcAllowUnverifiedEmail" className="cursor-pointer">
								Allow Unverified Email
							</Label>
							<Field name="oauth2InsecureOidcAllowUnverifiedEmail">
								{({ field }: FieldProps) => (
									<Switch
										id="oauth2InsecureOidcAllowUnverifiedEmail"
										checked={field.value}
										onCheckedChange={(checked) =>
											setFieldValue("oauth2InsecureOidcAllowUnverifiedEmail", checked)
										}
									/>
								)}
							</Field>
						</div>
						<div className="text-xs text-muted-foreground">
							Don't fail if an email address in an id_token is not verified.
						</div>
					</div>
					<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="oauth2AllowedGroups">Allowed Groups</Label>
							<Field name="oauth2AllowedGroups">
								{({ field }: FieldProps) => (
									<Input {...field} id="oauth2AllowedGroups" placeholder="admin,dev" />
								)}
							</Field>
							<div className="text-xs text-muted-foreground">Comma-separated list of allowed groups.</div>
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
							<div className="text-xs text-muted-foreground">Comma-separated list of allowed emails.</div>
						</div>
						<div className="space-y-2">
							<Label htmlFor="oauth2AllowedEmailDomains">Allowed Domains</Label>
							<Field name="oauth2AllowedEmailDomains">
								{({ field }: FieldProps) => (
									<Input {...field} id="oauth2AllowedEmailDomains" placeholder="example.com" />
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
							{({ field }: FieldProps) => <Input {...field} id="oidcClientId" />}
						</Field>
					</div>
					<div className="space-y-2">
						<Label htmlFor="oidcClientSecret">Client Secret</Label>
						<Field name="oidcClientSecret">
							{({ field }: FieldProps) => <Input {...field} type="password" id="oidcClientSecret" />}
						</Field>
					</div>
				</>
			)}
		</TabsContent>
	);
};

export default AccessListSsoTab;
