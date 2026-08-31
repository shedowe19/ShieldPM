/**
 * Security Settings Tab
 *
 * Allows users to manage TOTP, YubiKey, Passkey, and Duo Security 2FA methods,
 * as well as regenerate backup codes.
 */

import { startRegistration } from "@simplewebauthn/browser";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AlertCircle,
	CheckCircle2,
	Key,
	Loader2,
	Lock,
	RefreshCw,
	Shield,
	ShieldCheck,
	Smartphone,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	add2faYubikey,
	beginPasskeyRegistration,
	completePasskeyRegistration,
	enable2faTotp,
	get2fa,
	getSetting,
	regenerate2faBackupCodes,
	remove2faMethod,
	setup2faDuo,
	setup2faTotp,
	type TwoFaMethod,
} from "src/api/backend";
import { ApiError } from "src/api/backend/base";
import StepUpDialog from "src/components/StepUpDialog";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { intl, T } from "src/locale";

const QUERY_KEY = ["2fa", "me"] as const;
type RequestStepUp = (retry: () => void) => void;

const isStepUpRequired = (error: unknown) =>
	error instanceof ApiError && error.status === 400 && error.message === "Recent authentication is required";

const METHOD_LABELS: Record<string, string> = {
	totp: intl.formatMessage({ id: "2fa.method.totp" }),
	yubikey: intl.formatMessage({ id: "2fa.method.yubikey" }),
	passkey: intl.formatMessage({ id: "2fa.method.passkey" }),
	duo: intl.formatMessage({ id: "2fa.method.duo" }),
};

const METHOD_ICONS: Record<string, React.ReactNode> = {
	totp: <Smartphone className="h-5 w-5 text-blue-500" />,
	yubikey: <Key className="h-5 w-5 text-yellow-500" />,
	passkey: <ShieldCheck className="h-5 w-5 text-green-500" />,
	duo: <Lock className="h-5 w-5 text-purple-500" />,
};

// ---------------------------------------------------------------------------
// TOTP Setup Dialog
// ---------------------------------------------------------------------------
function TotpSetup({ onComplete, requestStepUp }: { onComplete: () => void; requestStepUp: RequestStepUp }) {
	const [qr, setQr] = useState<string | null>(null);
	const [code, setCode] = useState("");
	const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const beginSetup = useCallback(() => {
		setLoading(true);
		setup2faTotp("me")
			.then((r) => setQr(r.qrDataUrl))
			.catch((caught) => {
				if (isStepUpRequired(caught)) requestStepUp(beginSetup);
				else if (caught instanceof Error) setError(caught.message);
			})
			.finally(() => setLoading(false));
	}, [requestStepUp]);

	useEffect(() => beginSetup(), [beginSetup]);

	const handleEnable = async () => {
		setError("");
		setLoading(true);
		try {
			const result = await enable2faTotp("me", code);
			setBackupCodes(result.backupCodes);
		} catch (caught) {
			if (isStepUpRequired(caught)) requestStepUp(handleEnable);
			else if (caught instanceof Error) setError(caught.message);
		} finally {
			setLoading(false);
		}
	};

	if (backupCodes) {
		return (
			<div className="space-y-4">
				<Alert>
					<CheckCircle2 className="h-4 w-4 text-green-500" />
					<AlertTitle>
						<T id="2fa.totp.enabled" />
					</AlertTitle>
					<AlertDescription>
						<T id="2fa.backup-codes.save-info" />
					</AlertDescription>
				</Alert>
				<div className="grid grid-cols-2 gap-2 font-mono text-sm bg-muted p-4 rounded-md">
					{backupCodes.map((c) => (
						<span key={c}>{c}</span>
					))}
				</div>
				<Button onClick={onComplete} className="w-full">
					<T id="2fa.done" />
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{error && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			{loading && !qr && (
				<div className="flex justify-center py-8">
					<Loader2 className="h-8 w-8 animate-spin" />
				</div>
			)}
			{qr && (
				<div className="flex flex-col items-center space-y-4">
					<p className="text-sm text-muted-foreground text-center">
						<T id="2fa.totp.scan-qr" />
					</p>
					<img
						src={qr}
						alt={intl.formatMessage({ id: "2fa.totp.qr-alt" })}
						className="rounded-lg border w-48 h-48"
					/>
					<div className="w-full space-y-3">
						<div className="space-y-1">
							<Label>
								<T id="2fa.totp.verification-code" />
							</Label>
							<Input
								value={code}
								onChange={(e) => setCode(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										e.stopPropagation();
										handleEnable();
									}
								}}
								placeholder="123456"
								inputMode="numeric"
								maxLength={6}
								autoFocus
								className="font-mono tracking-widest"
							/>
						</div>
						<Button
							type="button"
							onClick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								handleEnable();
							}}
							className="w-full"
							disabled={loading || code.length < 6}
						>
							{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							<T id="2fa.totp.verify-enable" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// YubiKey Setup
// ---------------------------------------------------------------------------
function YubikeySetup({ onComplete, requestStepUp }: { onComplete: () => void; requestStepUp: RequestStepUp }) {
	const [otp, setOtp] = useState("");
	const [label, setLabel] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const otpRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		otpRef.current?.focus();
	}, []);

	const handleAdd = async (e?: React.SyntheticEvent) => {
		if (e) e.preventDefault();
		setError("");
		setLoading(true);
		try {
			await add2faYubikey("me", otp, label || intl.formatMessage({ id: "2fa.method.yubikey" }));
			onComplete();
		} catch (caught) {
			if (isStepUpRequired(caught)) requestStepUp(() => void handleAdd());
			else if (caught instanceof Error) setError(caught.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div
			className="space-y-4"
			role="form"
			onKeyDown={(e) => {
				if (e.key === "Enter") handleAdd(e);
			}}
		>
			{error && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			<p className="text-sm text-muted-foreground">
				<T id="2fa.yubikey.instruction" />
			</p>
			<div className="space-y-1">
				<Label>
					<T id="2fa.label-optional" />
				</Label>
				<Input
					value={label}
					onChange={(e) => setLabel(e.target.value)}
					placeholder={intl.formatMessage({ id: "2fa.yubikey.label-placeholder" })}
				/>
			</div>
			<div className="space-y-1">
				<Label>
					<T id="2fa.yubikey.otp" />
				</Label>
				<Input
					ref={otpRef}
					value={otp}
					onChange={(e) => setOtp(e.target.value)}
					placeholder={intl.formatMessage({ id: "2fa.yubikey.otp-placeholder" })}
					className="font-mono"
					type="text"
				/>
			</div>
			<Button type="button" onClick={handleAdd} className="w-full" disabled={loading || otp.length < 32}>
				{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
				<T id="2fa.yubikey.add" />
			</Button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Passkey Setup
// ---------------------------------------------------------------------------
function PasskeySetup({
	onComplete,
	requestStepUp,
}: {
	onComplete: (backupCodes: string[] | null) => void;
	requestStepUp: RequestStepUp;
}) {
	const [label, setLabel] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const handleRegister = async () => {
		setError("");
		setLoading(true);
		try {
			const { options, challengeId } = await beginPasskeyRegistration("me");
			const registrationResponse = await startRegistration({ optionsJSON: options as any });
			const result = await completePasskeyRegistration(
				"me",
				challengeId,
				registrationResponse,
				label || intl.formatMessage({ id: "2fa.method.passkey" }),
			);
			onComplete(result.backupCodes);
		} catch (caught) {
			if (isStepUpRequired(caught)) requestStepUp(() => void handleRegister());
			else if (caught instanceof Error) setError(caught.message);
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="space-y-4">
			{error && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			<p className="text-sm text-muted-foreground">
				<T id="2fa.passkey.instruction" />
			</p>
			<div className="space-y-1">
				<Label>
					<T id="2fa.label-optional" />
				</Label>
				<Input
					value={label}
					onChange={(e) => setLabel(e.target.value)}
					placeholder={intl.formatMessage({ id: "2fa.passkey.label-placeholder" })}
				/>
			</div>
			<Button onClick={handleRegister} className="w-full" disabled={loading}>
				{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
				<T id="2fa.passkey.register" />
			</Button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Duo Security Setup
// ---------------------------------------------------------------------------
function DuoSetup({ onComplete, requestStepUp }: { onComplete: () => void; requestStepUp: RequestStepUp }) {
	const [form, setForm] = useState({ clientId: "", clientSecret: "", apiHost: "", redirectUrl: "" });
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const handleSetup = async () => {
		setError("");
		setLoading(true);
		try {
			await setup2faDuo("me", form);
			onComplete();
		} catch (caught) {
			if (isStepUpRequired(caught)) requestStepUp(() => void handleSetup());
			else if (caught instanceof Error) setError(caught.message);
		} finally {
			setLoading(false);
		}
	};

	const update = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
		setForm((f) => ({ ...f, [key]: e.target.value }));

	const duoFields = [
		{ key: "clientId", labelId: "2fa.duo.client-id", placeholder: "DI..." },
		{ key: "clientSecret", labelId: "2fa.duo.client-secret", placeholder: "•••••••••••••••••••••" },
		{ key: "apiHost", labelId: "2fa.duo.api-hostname", placeholder: "api-XXXXXXXX.duosecurity.com" },
		{
			key: "redirectUrl",
			labelId: "2fa.duo.redirect-url",
			placeholder: intl.formatMessage({ id: "2fa.duo.redirect-url-placeholder" }),
		},
	];

	return (
		<div
			className="space-y-4"
			role="form"
			onKeyDown={(e) => {
				if (e.key === "Enter") {
					e.preventDefault();
					e.stopPropagation();
					handleSetup();
				}
			}}
		>
			{error && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			<p className="text-sm text-muted-foreground">
				<T id="2fa.duo.instruction" />
			</p>
			{duoFields.map(({ key, labelId, placeholder }) => (
				<div key={key} className="space-y-1">
					<Label>
						<T id={labelId} />
					</Label>
					<Input
						value={(form as Record<string, string>)[key]}
						onChange={update(key)}
						placeholder={placeholder}
						type={key === "clientSecret" ? "password" : "text"}
						required
					/>
				</div>
			))}
			<Button
				type="button"
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					handleSetup();
				}}
				className="w-full"
				disabled={loading}
			>
				{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
				<T id="2fa.duo.save-verify" />
			</Button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Main Security Tab
// ---------------------------------------------------------------------------
type SetupView = "totp" | "yubikey" | "passkey" | "duo" | "backup_codes" | null;

export default function SecuritySettings() {
	const queryClient = useQueryClient();
	const [setupView, setSetupView] = useState<SetupView>(null);
	const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
	const [error, setError] = useState("");
	const [stepUpOpen, setStepUpOpen] = useState(false);
	const pendingRetry = useRef<(() => void) | null>(null);
	const requestStepUp = useCallback((retry: () => void) => {
		pendingRetry.current = retry;
		setStepUpOpen(true);
	}, []);

	const { data, isLoading } = useQuery({
		queryKey: QUERY_KEY,
		queryFn: () => get2fa("me"),
	});
	const { data: oidcSetting } = useQuery({
		queryKey: ["setting", "oidc-config"],
		queryFn: () => getSetting("oidc-config"),
	});

	const removeMutation = useMutation({
		mutationFn: (methodId: number) => remove2faMethod("me", methodId),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: QUERY_KEY }),
		onError: (caught: Error, methodId) => {
			if (isStepUpRequired(caught)) requestStepUp(() => removeMutation.mutate(methodId));
			else setError(caught.message);
		},
	});

	const regenMutation = useMutation({
		mutationFn: () => regenerate2faBackupCodes("me"),
		onSuccess: (result) => {
			setBackupCodes(result.backupCodes);
			queryClient.invalidateQueries({ queryKey: QUERY_KEY });
		},
		onError: (caught: Error) => {
			if (isStepUpRequired(caught)) requestStepUp(() => regenMutation.mutate());
			else setError(caught.message);
		},
	});

	const handleSetupComplete = (newBackupCodes?: string[] | null) => {
		setSetupView(null);
		if (newBackupCodes) setBackupCodes(newBackupCodes);
		queryClient.invalidateQueries({ queryKey: QUERY_KEY });
	};

	const activeMethods: TwoFaMethod[] = data?.methods?.filter((m) => m.isVerified) ?? [];
	const hasMethods = activeMethods.length > 0;
	const oidcEnabled = oidcSetting?.meta?.enabled === true;
	const oidcLinked = new URLSearchParams(window.location.search).get("oidc_linked") === "1";

	if (isLoading) {
		return (
			<div className="flex justify-center py-12">
				<Loader2 className="h-8 w-8 animate-spin" />
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<StepUpDialog
				open={stepUpOpen}
				onOpenChange={setStepUpOpen}
				onComplete={() => {
					const retry = pendingRetry.current;
					pendingRetry.current = null;
					retry?.();
				}}
			/>
			{oidcLinked && (
				<Alert>
					<CheckCircle2 className="h-4 w-4 text-green-500" />
					<AlertDescription>
						<T id="oidc.link.success" />
					</AlertDescription>
				</Alert>
			)}
			{oidcEnabled && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							<T id="oidc.link" />
						</CardTitle>
						<CardDescription>
							<T id="oidc.link.description" />
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button asChild variant="outline">
							<a
								href="/api/oidc?purpose=link"
								onClick={(event) => {
									event.preventDefault();
									requestStepUp(() => window.location.assign("/api/oidc?purpose=link"));
								}}
							>
								<T id="oidc.link" />
							</a>
						</Button>
					</CardContent>
				</Card>
			)}
			<div>
				<h3 className="text-lg font-semibold flex items-center gap-2">
					<Shield className="h-5 w-5" />
					<T id="2fa.title" />
				</h3>
				<p className="text-sm text-muted-foreground mt-1">
					<T id="2fa.description" />
				</p>
			</div>

			{error && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertTitle>
						<T id="2fa.error" />
					</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			{/* Backup codes display (after setup) */}
			{backupCodes && (
				<Alert>
					<CheckCircle2 className="h-4 w-4 text-green-500" />
					<AlertTitle>
						<T id="2fa.backup-codes.save-title" />
					</AlertTitle>
					<AlertDescription>
						<p className="mb-2">
							<T id="2fa.backup-codes.save-info" />
						</p>
						<div className="grid grid-cols-2 gap-1 font-mono text-sm bg-muted p-3 rounded">
							{backupCodes.map((c) => (
								<span key={c}>{c}</span>
							))}
						</div>
						<Button variant="outline" size="sm" className="mt-2" onClick={() => setBackupCodes(null)}>
							<T id="2fa.backup-codes.saved" />
						</Button>
					</AlertDescription>
				</Alert>
			)}

			{/* Active methods */}
			{hasMethods && (
				<Card>
					<CardHeader className="pb-3">
						<CardTitle className="text-base">
							<T id="2fa.active-methods" />
						</CardTitle>
						<CardDescription>
							<T id="2fa.backup-codes.remaining" data={{ count: data?.backupCodesRemaining ?? 0 }} />
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						{activeMethods.map((method) => (
							<div
								key={method.id}
								className="flex items-center justify-between rounded-md border px-4 py-3"
							>
								<div className="flex items-center gap-3">
									{METHOD_ICONS[method.type] ?? <Shield className="h-5 w-5" />}
									<div>
										<p className="text-sm font-medium">{method.label}</p>
										<p className="text-xs text-muted-foreground">
											{METHOD_LABELS[method.type] ?? method.type}
										</p>
									</div>
								</div>
								<Button
									variant="ghost"
									size="sm"
									className="text-destructive hover:text-destructive"
									disabled={removeMutation.isPending}
									onClick={() => removeMutation.mutate(method.id)}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						))}

						<div className="flex gap-2 pt-2">
							<Button
								variant="outline"
								size="sm"
								onClick={() => regenMutation.mutate()}
								disabled={regenMutation.isPending}
							>
								{regenMutation.isPending ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<RefreshCw className="mr-2 h-4 w-4" />
								)}
								<T id="2fa.backup-codes.regenerate" />
							</Button>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Setup panel */}
			{setupView && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base flex items-center gap-2">
							{METHOD_ICONS[setupView] ?? <Shield className="h-5 w-5" />}
							<T id="2fa.setup" data={{ method: METHOD_LABELS[setupView] ?? setupView }} />
						</CardTitle>
					</CardHeader>
					<CardContent>
						{setupView === "totp" && (
							<TotpSetup onComplete={() => handleSetupComplete()} requestStepUp={requestStepUp} />
						)}
						{setupView === "yubikey" && (
							<YubikeySetup onComplete={() => handleSetupComplete()} requestStepUp={requestStepUp} />
						)}
						{setupView === "passkey" && (
							<PasskeySetup
								onComplete={(codes) => handleSetupComplete(codes)}
								requestStepUp={requestStepUp}
							/>
						)}
						{setupView === "duo" && (
							<DuoSetup onComplete={() => handleSetupComplete()} requestStepUp={requestStepUp} />
						)}
						<Button variant="ghost" size="sm" className="mt-4 w-full" onClick={() => setSetupView(null)}>
							<T id="2fa.cancel" />
						</Button>
					</CardContent>
				</Card>
			)}

			{/* Add new method */}
			{!setupView && (
				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							<T id="2fa.add-method" />
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid gap-3 sm:grid-cols-2">
							{[
								{ type: "totp" as const, descId: "2fa.totp.description" },
								{ type: "yubikey" as const, descId: "2fa.yubikey.description" },
								{ type: "passkey" as const, descId: "2fa.passkey.description" },
								{ type: "duo" as const, descId: "2fa.duo.description" },
							].map(({ type, descId }) => (
								<button
									key={type}
									type="button"
									onClick={() => setSetupView(type)}
									className="flex items-start gap-3 rounded-lg border p-4 text-left hover:bg-muted transition-colors"
								>
									{METHOD_ICONS[type]}
									<div>
										<p className="text-sm font-medium">{METHOD_LABELS[type]}</p>
										<p className="text-xs text-muted-foreground mt-0.5">
											<T id={descId} />
										</p>
									</div>
								</button>
							))}
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
