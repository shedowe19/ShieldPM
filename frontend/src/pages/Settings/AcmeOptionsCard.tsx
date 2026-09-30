import { useState } from "react";
import type { AcmeOptions, AcmeOptionsUpdate, AcmeOptionsValues } from "src/api/backend/acmeOptions";
import { Loading } from "src/components/Loading";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Switch } from "src/components/ui/switch";
import { useAcmeOptions, useSetAcmeOptions } from "src/hooks/useAcmeOptions";
import { useCertificates } from "src/hooks/useCertificates";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

export const acmeServers = {
	production: "https://acme-v02.api.letsencrypt.org/directory",
	staging: "https://acme-staging-v02.api.letsencrypt.org/directory",
	zerossl: "https://acme.zerossl.com/v2/DV90",
} as const;

const invalidText = (value: string) =>
	/\s/.test(value) || [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);

function validServer(server: string) {
	try {
		const url = new URL(server);
		return (
			["http:", "https:"].includes(url.protocol) &&
			Boolean(url.hostname) &&
			!url.username &&
			!url.password &&
			!url.hash &&
			!invalidText(server)
		);
	} catch {
		return false;
	}
}

function ordinaryOptions({ eabHmacKeySet: _marker, ...values }: AcmeOptions): AcmeOptionsValues {
	return values;
}

export default function AcmeOptionsCard() {
	const { data, isPending, error } = useAcmeOptions();
	const saveOptions = useSetAcmeOptions();
	const certificates = useCertificates();
	const [draft, setDraft] = useState<AcmeOptionsValues>();
	const [secret, setSecret] = useState("");
	const [clearSecret, setClearSecret] = useState(false);
	const [customServer, setCustomServer] = useState(false);
	const values = draft ?? (data && ordinaryOptions(data));
	const pending = saveOptions.isPending;
	const serverChoice = customServer
		? "custom"
		: (Object.entries(acmeServers).find(([, url]) => url === values?.server)?.[0] ?? "custom");
	const isLetsEncrypt =
		values &&
		(() => {
			try {
				return /^acme(?:-staging)?-v02\.api\.letsencrypt\.org$/i.test(new URL(values.server).hostname);
			} catch {
				return false;
			}
		})();
	const retainedKey = data?.eabHmacKeySet && !clearSecret;
	const identityChanged = data && values && (data.server !== values.server || data.eabKid !== values.eabKid);
	const eabError =
		values &&
		((retainedKey && identityChanged && !secret) ||
			(secret && !values.eabKid.trim()) ||
			(values.eabKid.trim() && !retainedKey && !secret) ||
			(secret && !/^[A-Za-z0-9_-]+={0,2}$/.test(secret)) ||
			invalidText(values.eabKid) ||
			["[", "]", '"', "'", "#", ";"].some((character) => values.eabKid.includes(character)) ||
			((retainedKey || secret) && !values.email));
	const mustStapleError = values?.mustStaple && (isLetsEncrypt || !values.ocspStapling);
	const changed =
		data &&
		values &&
		(Object.keys(data).some(
			(key) =>
				key !== "eabHmacKeySet" &&
				values[key as keyof AcmeOptionsValues] !== data[key as keyof AcmeOptionsValues],
		) ||
			Boolean(secret) ||
			clearSecret);
	const valid =
		values &&
		validServer(values.server) &&
		!invalidText(values.email) &&
		(!values.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) &&
		/^[A-Za-z0-9_-]{0,128}$/.test(values.accountId) &&
		Number.isSafeInteger(values.defaultCertificateId) &&
		values.defaultCertificateId >= 0 &&
		!eabError &&
		!mustStapleError;
	const activeCertificates = certificates.data?.filter((cert) => Date.parse(cert.expiresOn) > Date.now()) ?? [];
	const unavailableCertificate =
		values &&
		values.defaultCertificateId > 0 &&
		!activeCertificates.some((cert) => cert.id === values.defaultCertificateId);
	const change = (patch: Partial<AcmeOptionsValues>) => {
		if (!values) return;
		saveOptions.reset();
		setDraft({ ...values, ...patch });
	};
	const save = async () => {
		if (!data || !values || !changed || !valid || pending) return;
		const request: AcmeOptionsUpdate = { ...values };
		if (clearSecret) request.eabHmacKey = null;
		else if (secret) request.eabHmacKey = secret;
		try {
			await saveOptions.mutateAsync(request);
			setDraft(undefined);
			setSecret("");
			setClearSecret(false);
			saveOptions.reset();
			showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.SETTING, "saved");
		} catch {
			// Keep all unsaved fields, including a replacement key, for correction.
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<T id="settings.acme.title" />
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{isPending && <Loading noLogo />}
				{(saveOptions.error || error) && (
					<Alert variant="destructive">
						<AlertDescription>{(saveOptions.error || error)?.message}</AlertDescription>
					</Alert>
				)}
				{values && (
					<>
						<div className="space-y-2">
							<Label htmlFor="acmeServerChoice">
								<T id="settings.acme.server" />
							</Label>
							<Select
								value={serverChoice}
								disabled={pending}
								onValueChange={(choice) => {
									setCustomServer(choice === "custom");
									if (choice !== "custom")
										change({ server: acmeServers[choice as keyof typeof acmeServers] });
								}}
							>
								<SelectTrigger id="acmeServerChoice">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="production">Let’s Encrypt</SelectItem>
									<SelectItem value="staging">
										<T id="settings.acme.staging" />
									</SelectItem>
									<SelectItem value="zerossl">ZeroSSL</SelectItem>
									<SelectItem value="custom">
										<T id="settings.acme.custom-server" />
									</SelectItem>
								</SelectContent>
							</Select>
							{serverChoice === "custom" && (
								<>
									<Label htmlFor="acmeServerUrl">
										<T id="settings.acme.directory-url" />
									</Label>
									<Input
										id="acmeServerUrl"
										type="url"
										value={values.server}
										disabled={pending}
										onChange={(event) => change({ server: event.target.value })}
									/>
								</>
							)}
							<p className="text-sm text-muted-foreground">
								<T id="settings.acme.server-description" />
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="acmeEmail">
								<T id="email-address" />
							</Label>
							<Input
								id="acmeEmail"
								type="email"
								value={values.email}
								disabled={pending}
								onChange={(event) => change({ email: event.target.value })}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="acmeAccountId">
								<T id="settings.acme.account-id" />
							</Label>
							<Input
								id="acmeAccountId"
								value={values.accountId}
								disabled={pending}
								onChange={(event) => change({ accountId: event.target.value })}
							/>
							<p className="text-sm text-muted-foreground">
								<T id="settings.acme.account-id-description" />
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="acmeEabKid">
								<T id="settings.acme.eab-kid" />
							</Label>
							<Input
								id="acmeEabKid"
								value={values.eabKid}
								disabled={pending}
								onChange={(event) => change({ eabKid: event.target.value })}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="acmeEabKey">
								<T id="settings.acme.eab-key" />
							</Label>
							<Input
								id="acmeEabKey"
								type="password"
								autoComplete="new-password"
								value={secret}
								disabled={pending}
								onChange={(event) => {
									setSecret(event.target.value);
									setClearSecret(false);
									change({});
								}}
							/>
							<p className="text-sm text-muted-foreground">
								<T id={retainedKey ? "settings.acme.key-retained" : "settings.acme.key-description"} />
							</p>
							<Button
								type="button"
								variant="outline"
								disabled={pending || (!data?.eabHmacKeySet && !values.eabKid && !secret)}
								onClick={() => {
									change({ eabKid: "" });
									setSecret("");
									setClearSecret(true);
								}}
							>
								<T id="settings.acme.clear-eab" />
							</Button>
							{eabError && (
								<p role="alert" className="text-sm text-destructive">
									<T id="settings.acme.eab-error" />
								</p>
							)}
						</div>
						{(
							[
								["agreeTos", "settings.acme.agree-tos"],
								["serverTlsVerify", "settings.acme.tls-verify"],
								["mustStaple", "settings.acme.must-staple"],
								["ocspStapling", "settings.acme.ocsp"],
								["customOcspStapling", "settings.acme.custom-ocsp"],
							] as const
						).map(([field, label]) => (
							<div key={field} className="flex items-center gap-2">
								<Switch
									id={`acme-${field}`}
									checked={values[field]}
									disabled={pending}
									onCheckedChange={(checked) =>
										change({
											[field]: checked,
											...(field === "mustStaple" && checked ? { ocspStapling: true } : {}),
											...(field === "ocspStapling" && !checked ? { mustStaple: false } : {}),
										})
									}
								/>
								<Label htmlFor={`acme-${field}`}>
									<T id={label} />
								</Label>
							</div>
						))}
						<p className="text-sm text-muted-foreground">
							<T id="settings.acme.account-description" />
						</p>
						{mustStapleError && (
							<p role="alert" className="text-sm text-destructive">
								<T id="settings.acme.must-staple-error" />
							</p>
						)}
						<div className="space-y-2">
							<Label htmlFor="acmeDefaultCertificate">
								<T id="settings.acme.default-certificate" />
							</Label>
							<Select
								value={String(values.defaultCertificateId)}
								disabled={pending || certificates.isLoading}
								onValueChange={(id) => change({ defaultCertificateId: Number(id) })}
							>
								<SelectTrigger id="acmeDefaultCertificate">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="0">
										<T id="settings.acme.dummy-certificate" />
									</SelectItem>
									{activeCertificates.map((cert) => (
										<SelectItem key={cert.id} value={String(cert.id)}>
											{cert.niceName || cert.domainNames.join(", ")}
										</SelectItem>
									))}
									{unavailableCertificate && (
										<SelectItem value={String(values.defaultCertificateId)} disabled>
											<T id="settings.acme.unavailable-certificate" /> (#
											{values.defaultCertificateId})
										</SelectItem>
									)}
								</SelectContent>
							</Select>
							{certificates.error && (
								<p role="alert" className="text-sm text-destructive">
									{certificates.error.message}
								</p>
							)}
						</div>
						<div className="flex justify-end">
							<Button type="button" onClick={save} disabled={!changed || !valid || pending}>
								<T id="save" />
							</Button>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
