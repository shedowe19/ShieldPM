/**
 * Duo Security callback page.
 *
 * After the user authenticates in Duo's hosted UI, Duo redirects here with
 * `duo_code` and `state` query parameters. We complete the authentication
 * and issue full session tokens.
 */

import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { complete2faDuoAuth } from "src/api/backend";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { intl, T } from "src/locale";
import AuthStore from "src/modules/AuthStore";

export default function DuoCallback() {
	const [searchParams] = useSearchParams();
	const [error, setError] = useState("");
	const called = useRef(false);

	useEffect(() => {
		if (called.current) return;
		called.current = true;

		const duoCode = searchParams.get("duo_code");
		const pendingToken = sessionStorage.getItem("duo_pending_token");

		if (!duoCode || !pendingToken) {
			setError(intl.formatMessage({ id: "duo-callback.error.missing" }));
			return;
		}

		sessionStorage.removeItem("duo_pending_token");

		complete2faDuoAuth(pendingToken, duoCode)
			.then((response) => {
				AuthStore.set(response);
				window.location.replace("/");
			})
			.catch((err: Error) => {
				setError(err.message || intl.formatMessage({ id: "duo-callback.error.failed" }));
			});
	}, [searchParams]);

	if (error) {
		return (
			<div className="flex min-h-screen items-center justify-center p-4">
				<div className="w-full max-w-md">
					<Alert variant="destructive">
						<AlertCircle className="h-4 w-4" />
						<AlertTitle>
							<T id="duo-callback.authentication-failed" />
						</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
					<a
						href="/login"
						className="mt-4 block text-center text-sm text-primary underline-offset-4 hover:underline"
					>
						<T id="duo-callback.return-to-sign-in" />
					</a>
				</div>
			</div>
		);
	}

	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="flex flex-col items-center gap-4">
				<Loader2 className="h-10 w-10 animate-spin text-primary" />
				<p className="text-sm text-muted-foreground">
					<T id="duo-callback.completing" />
				</p>
			</div>
		</div>
	);
}
