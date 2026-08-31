import { startAuthentication } from "@simplewebauthn/browser";
import { AlertCircle, Key, Loader2, Lock, ShieldCheck, Smartphone } from "lucide-react";
import { useState } from "react";
import { begin2faDuoAuth, begin2faPasskeyAuth, complete2faPasskeyAuth, verify2faCode } from "src/api/backend";
import type { TokenResponse } from "src/api/backend/responseTypes";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { intl, T } from "src/locale";
import AuthStore from "src/modules/AuthStore";

interface TwoFAStepProps {
	pendingToken: string;
	methods: string[];
	onSuccess: (response: TokenResponse) => void;
	duoReturnTo?: string;
}

type ActiveMethod = "totp" | "yubikey" | "backup_code" | "passkey" | "duo" | null;

const METHOD_ICONS: Record<string, React.ReactNode> = {
	totp: <Smartphone className="h-5 w-5" />,
	yubikey: <Key className="h-5 w-5" />,
	passkey: <ShieldCheck className="h-5 w-5" />,
	duo: <Lock className="h-5 w-5" />,
};

const METHOD_LABELS: Record<string, string> = {
	totp: intl.formatMessage({ id: "2fa.method.totp" }),
	yubikey: intl.formatMessage({ id: "2fa.method.yubikey" }),
	passkey: intl.formatMessage({ id: "2fa.method.passkey" }),
	duo: intl.formatMessage({ id: "2fa.method.duo" }),
};

export default function TwoFAStep({ pendingToken, methods, onSuccess, duoReturnTo }: TwoFAStepProps) {
	const [activeMethod, setActiveMethod] = useState<ActiveMethod>(null);
	const [code, setCode] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const handleCodeSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!activeMethod || !code.trim()) return;

		setError("");
		setLoading(true);
		try {
			const response = await verify2faCode({
				pendingToken,
				method: activeMethod as "totp" | "yubikey" | "backup_code",
				code: code.trim(),
			});
			AuthStore.set(response);
			onSuccess(response);
		} catch (err) {
			if (err instanceof Error) setError(err.message);
		} finally {
			setLoading(false);
		}
	};

	const handlePasskeyAuth = async () => {
		setError("");
		setLoading(true);
		try {
			const { options, challengeId } = await begin2faPasskeyAuth(pendingToken);
			const authResponse = await startAuthentication({ optionsJSON: options as any });
			const response = await complete2faPasskeyAuth(pendingToken, challengeId, authResponse);
			AuthStore.set(response);
			onSuccess(response);
		} catch (err) {
			if (err instanceof Error) setError(err.message);
		} finally {
			setLoading(false);
		}
	};

	const handleDuoAuth = async () => {
		setError("");
		setLoading(true);
		try {
			const { authUrl, state } = await begin2faDuoAuth(pendingToken);
			sessionStorage.setItem("duo_pending_token", pendingToken);
			sessionStorage.setItem("duo_expected_state", state);
			if (duoReturnTo) sessionStorage.setItem("duo_return_to", duoReturnTo);
			window.location.href = authUrl;
		} catch (err) {
			if (err instanceof Error) setError(err.message);
			setLoading(false);
		}
	};

	const renderMethodButton = (method: ActiveMethod) => {
		if (!method || method === "backup_code") return null;
		const isActive = activeMethod === method;

		if (method === "passkey") {
			return (
				<Button
					key={method}
					variant={isActive ? "default" : "outline"}
					className="w-full justify-start gap-3"
					onClick={handlePasskeyAuth}
					disabled={loading}
				>
					{METHOD_ICONS[method]}
					{METHOD_LABELS[method] || method}
					{loading && activeMethod === "passkey" && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
				</Button>
			);
		}

		if (method === "duo") {
			return (
				<Button
					key={method}
					variant={isActive ? "default" : "outline"}
					className="w-full justify-start gap-3"
					onClick={handleDuoAuth}
					disabled={loading}
				>
					{METHOD_ICONS[method]}
					{METHOD_LABELS[method] || method}
					{loading && activeMethod === "duo" && <Loader2 className="ml-auto h-4 w-4 animate-spin" />}
				</Button>
			);
		}

		return (
			<Button
				key={method}
				variant={isActive ? "default" : "outline"}
				className="w-full justify-start gap-3"
				onClick={() => {
					setActiveMethod(method);
					setCode("");
					setError("");
				}}
				disabled={loading}
			>
				{METHOD_ICONS[method] || <ShieldCheck className="h-5 w-5" />}
				{METHOD_LABELS[method] || method}
			</Button>
		);
	};

	const inputPlaceholder: Record<string, string> = {
		totp: "123456",
		yubikey: intl.formatMessage({ id: "2fa.yubikey.otp-placeholder" }),
		backup_code: intl.formatMessage({ id: "2fa.backup-code.placeholder" }),
	};

	const inputLabel: Record<string, string> = {
		totp: intl.formatMessage({ id: "2fa.login.totp-code" }),
		yubikey: intl.formatMessage({ id: "2fa.yubikey.otp" }),
		backup_code: intl.formatMessage({ id: "2fa.login.backup-code" }),
	};

	return (
		<div className="space-y-4">
			<div className="text-center space-y-1">
				<ShieldCheck className="mx-auto h-10 w-10 text-primary" />
				<h2 className="text-xl font-semibold">
					<T id="2fa.login.title" />
				</h2>
				<p className="text-sm text-muted-foreground">
					<T id="2fa.login.description" />
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

			<div className="space-y-2">
				{methods.filter((m) => m !== "backup_code").map((m) => renderMethodButton(m as ActiveMethod))}
			</div>

			{(activeMethod === "totp" || activeMethod === "yubikey" || activeMethod === "backup_code") && (
				<form onSubmit={handleCodeSubmit} className="space-y-3 pt-2 border-t">
					<div className="space-y-1">
						<Label htmlFor="2fa-code">{inputLabel[activeMethod] || ""}</Label>
						<Input
							id="2fa-code"
							type="text"
							inputMode={activeMethod === "totp" ? "numeric" : "text"}
							value={code}
							onChange={(e) => setCode(e.target.value)}
							placeholder={inputPlaceholder[activeMethod] || ""}
							autoComplete="one-time-code"
							autoFocus
							className="bg-background/50 py-5 tracking-widest font-mono"
						/>
					</div>
					<Button type="submit" className="w-full" disabled={loading || !code.trim()}>
						{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
						<T id="2fa.login.verify" />
					</Button>
				</form>
			)}

			{/* Backup code fallback always available */}
			<div className="pt-2 border-t">
				<button
					type="button"
					className="text-xs text-muted-foreground hover:text-primary underline-offset-2 hover:underline w-full text-center"
					onClick={() => {
						setActiveMethod("backup_code");
						setCode("");
						setError("");
					}}
				>
					<T id="2fa.login.use-backup" />
				</button>
			</div>
		</div>
	);
}
