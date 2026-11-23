import { IconShieldLock } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { getSettings, updateSetting } from "src/api/backend";
import type { Setting } from "src/api/backend/models";
import { Loading } from "src/components/Loading";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { T } from "src/locale";

interface OidcValues {
	enabled: boolean;
	enforceSso: boolean;
	name: string;
	issuerUrl: string;
	clientId: string;
	clientSecret: string;
	redirectUrl: string;
}

const SECRET_MASK = "********";

export default function Oidc() {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useQuery({
		queryKey: ["settings"],
		queryFn: () => getSettings(),
	});
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [saved, setSaved] = useState(false);

	const setting = data?.find((row) => row.id === "oidc-config");
	const meta = (setting?.meta ?? {}) as Record<string, unknown>;
	const [values, setValues] = useState<OidcValues>({
		enabled: meta.enabled === true,
		enforceSso: meta.enforce_sso === true,
		name: typeof meta.name === "string" ? meta.name : "",
		issuerUrl: typeof meta.issuerURL === "string" ? meta.issuerURL : "",
		clientId: typeof meta.clientID === "string" ? meta.clientID : "",
		clientSecret: "",
		redirectUrl: typeof meta.redirectURL === "string" ? meta.redirectURL : "",
	});

	useEffect(() => {
		if (!setting) return;
		const current = (setting.meta ?? {}) as Record<string, unknown>;
		setValues({
			enabled: current.enabled === true,
			enforceSso: current.enforce_sso === true,
			name: typeof current.name === "string" ? current.name : "",
			issuerUrl: typeof current.issuerURL === "string" ? current.issuerURL : "",
			clientId: typeof current.clientID === "string" ? current.clientID : "",
			clientSecret: "",
			redirectUrl: typeof current.redirectURL === "string" ? current.redirectURL : "",
		});
	}, [setting]);

	const save = useMutation({
		mutationFn: (payload: Setting) => updateSetting(payload),
		onSuccess: async () => {
			setSaved(true);
			setValues((current) => ({ ...current, clientSecret: "" }));
			await queryClient.invalidateQueries({ queryKey: ["settings"] });
		},
		onError: (err: Error) => setErrorMsg(err.message),
	});

	const configuredSecret = meta.clientSecret_configured === true || meta.clientSecret === SECRET_MASK;

	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		setErrorMsg(null);
		setSaved(false);
		const payload: Setting = {
			id: "oidc-config",
			value: "metadata",
			meta: {
				enabled: values.enabled,
				enforce_sso: values.enforceSso,
				name: values.name.trim(),
				issuerURL: values.issuerUrl.trim(),
				clientID: values.clientId.trim(),
				redirectURL: values.redirectUrl.trim(),
				...(values.clientSecret ? { clientSecret: values.clientSecret } : {}),
			},
		};
		save.mutate(payload);
	};

	if (isLoading) return <Loading noLogo />;
	if (error && !setting) {
		return (
			<Alert variant="destructive">
				<AlertCircle className="h-4 w-4" />
				<AlertTitle>
					<T id="error.title" />
				</AlertTitle>
				<AlertDescription>{error.message}</AlertDescription>
			</Alert>
		);
	}

	return (
		<Card className="border-t-4 border-slate-500/50">
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<IconShieldLock className="h-6 w-6" />
					Single Sign-On (OIDC)
				</CardTitle>
				<CardDescription>
					Sign in with an external OpenID Connect provider. Enforcing SSO disables local password login; keep
					a break-glass account and the <code>OIDC_ENFORCE_SSO=false</code> switch in mind.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<form className="space-y-5" onSubmit={submit}>
					{errorMsg && (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>
								<T id="error.title" />
							</AlertTitle>
							<AlertDescription>{errorMsg}</AlertDescription>
						</Alert>
					)}
					{saved && (
						<Alert>
							<AlertTitle>Saved</AlertTitle>
							<AlertDescription>The OIDC configuration was updated.</AlertDescription>
						</Alert>
					)}

					<div className="flex items-center justify-between rounded-md border p-3">
						<div>
							<Label htmlFor="oidc-enabled">Enable OIDC</Label>
							<p className="text-sm text-muted-foreground">Show the provider button on the login page.</p>
						</div>
						<Switch
							id="oidc-enabled"
							checked={values.enabled}
							onCheckedChange={(checked: boolean) => setValues({ ...values, enabled: checked })}
						/>
					</div>

					<div className="flex items-center justify-between rounded-md border p-3">
						<div>
							<Label htmlFor="oidc-enforce">Enforce SSO</Label>
							<p className="text-sm text-muted-foreground">
								Block local password login for everyone. Use only after the provider works.
							</p>
						</div>
						<Switch
							id="oidc-enforce"
							checked={values.enforceSso}
							onCheckedChange={(checked: boolean) => setValues({ ...values, enforceSso: checked })}
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="oidc-name">Display name</Label>
						<Input
							id="oidc-name"
							value={values.name}
							onChange={(event) => setValues({ ...values, name: event.target.value })}
							placeholder="Company login"
							autoComplete="off"
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="oidc-issuer">Issuer URL</Label>
						<Input
							id="oidc-issuer"
							type="url"
							value={values.issuerUrl}
							onChange={(event) => setValues({ ...values, issuerUrl: event.target.value })}
							placeholder="https://idp.example.com"
							autoComplete="off"
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="oidc-client-id">Client ID</Label>
						<Input
							id="oidc-client-id"
							value={values.clientId}
							onChange={(event) => setValues({ ...values, clientId: event.target.value })}
							autoComplete="off"
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="oidc-client-secret">Client secret</Label>
						<Input
							id="oidc-client-secret"
							type="password"
							value={values.clientSecret}
							onChange={(event) => setValues({ ...values, clientSecret: event.target.value })}
							placeholder={
								configuredSecret ? "Configured – leave blank to keep it" : "Enter the client secret"
							}
							autoComplete="new-password"
						/>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="oidc-redirect">Redirect URL</Label>
						<Input
							id="oidc-redirect"
							type="url"
							value={values.redirectUrl}
							onChange={(event) => setValues({ ...values, redirectUrl: event.target.value })}
							placeholder="https://shieldpm.example.com/api/oidc/callback"
							autoComplete="off"
						/>
						<p className="text-sm text-muted-foreground">
							Register exactly this URL at the provider. It must be an absolute URL and is never taken
							from the request Host header.
						</p>
					</div>

					<Button type="submit" disabled={save.isPending}>
						{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
						Save
					</Button>
				</form>
			</CardContent>
		</Card>
	);
}
