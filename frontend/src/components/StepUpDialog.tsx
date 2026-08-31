import { AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { stepUpAuthentication } from "src/api/backend";
import type { TwoFaChallengeResponse } from "src/api/backend/verify2fa";
import { intl, T } from "src/locale";
import TwoFAStep from "src/pages/Login/TwoFAStep";
import { Alert, AlertDescription } from "./ui/alert";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface StepUpDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onComplete: () => void;
}

export default function StepUpDialog({ open, onOpenChange, onComplete }: StepUpDialogProps) {
	const [password, setPassword] = useState("");
	const [challenge, setChallenge] = useState<TwoFaChallengeResponse | null>(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!open) {
			setPassword("");
			setChallenge(null);
			setError("");
		}
	}, [open]);

	const finish = () => {
		onOpenChange(false);
		onComplete();
	};

	const submit = async (event: FormEvent) => {
		event.preventDefault();
		setError("");
		setLoading(true);
		try {
			const response = await stepUpAuthentication(password);
			if ("requires2fa" in response) {
				setChallenge(response);
			} else {
				finish();
			}
		} catch (caught) {
			setError(caught instanceof Error ? caught.message : intl.formatMessage({ id: "step-up.failed" }));
		} finally {
			setLoading(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldCheck className="h-5 w-5" />
						<T id="step-up.title" />
					</DialogTitle>
				</DialogHeader>
				{challenge ? (
					<TwoFAStep
						pendingToken={challenge.pendingToken}
						methods={challenge.methods}
						onSuccess={finish}
						duoReturnTo="/profile"
					/>
				) : (
					<form className="space-y-4" onSubmit={submit}>
						<p className="text-sm text-muted-foreground">
							<T id="step-up.description" />
						</p>
						{error && (
							<Alert variant="destructive">
								<AlertCircle className="h-4 w-4" />
								<AlertDescription>{error}</AlertDescription>
							</Alert>
						)}
						<div className="space-y-2">
							<Label htmlFor="step-up-password">
								<T id="user.current-password" />
							</Label>
							<Input
								id="step-up-password"
								type="password"
								autoComplete="current-password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
								required
								autoFocus
							/>
						</div>
						<Button type="submit" className="w-full" disabled={loading || !password}>
							{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							<T id="step-up.continue" />
						</Button>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
