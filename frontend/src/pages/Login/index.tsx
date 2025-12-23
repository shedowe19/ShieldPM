import { Field, Form, Formik } from "formik";
import { useEffect, useRef, useState } from "react";
import { claimOidcToken } from "src/api/backend";
import { LocalePicker, ThemeSwitcher } from "src/components";
import { useAuthState } from "src/context";
import { useHealth } from "src/hooks";
import { intl, T } from "src/locale";
import AuthStore from "src/modules/AuthStore";
import { validateEmail, validateString } from "src/modules/Validations";

import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { AlertCircle, Loader2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";

export default function Login() {
	const emailRef = useRef<HTMLInputElement>(null);
	const [formErr, setFormErr] = useState("");
	const { login } = useAuthState();

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		setFormErr("");
		try {
			await login(values.email, values.password);
		} catch (err) {
			if (err instanceof Error) {
				setFormErr(err.message);
			}
		}
		setSubmitting(false);
	};

	useEffect(() => {
		emailRef.current?.focus();
		// Try to claim OIDC token if available
		claimOidcToken()
			.then((response) => {
				AuthStore.add(response);
				window.location.reload();
			})
			.catch(() => {
				// Ignore errors, no pending OIDC login
			});
	}, []);

	const health = useHealth();

	const getVersion = () => {
		if (!health.data) {
			return "";
		}
		return health.data.version;
	};

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 dark:from-black dark:via-gray-900 dark:to-gray-950 p-4">
			<div className="absolute top-4 right-4 flex gap-2">
				<LocalePicker />
				<ThemeSwitcher />
			</div>

			<div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
				<div className="flex flex-col items-center justify-center mb-8">
					<img className="h-16 w-auto mb-4 drop-shadow-2xl" src="/images/logo-256.png" alt="NPMplus" />
				</div>

				<Card className="border-0 shadow-2xl bg-card/80 backdrop-blur-sm dark:bg-card/50 ring-1 ring-white/10 dark:ring-white/5">
					<CardHeader className="space-y-1">
						<CardTitle className="text-3xl font-bold text-center tracking-tight">
							<T id="login.title" />
						</CardTitle>
						<CardDescription className="text-center">Enter your credentials to continue</CardDescription>
					</CardHeader>
					<CardContent>
						{formErr !== "" && (
							<Alert variant="destructive" className="mb-6">
								<AlertCircle className="h-4 w-4" />
								<AlertTitle>Error</AlertTitle>
								<AlertDescription>{formErr}</AlertDescription>
							</Alert>
						)}

						<Formik
							initialValues={
								{
									email: "",
									password: "",
								} as any
							}
							onSubmit={onSubmit}
						>
							{({ isSubmitting, errors, touched }: any) => (
								<Form className="space-y-4">
									<div className="space-y-2">
										<Field name="email" validate={validateEmail()}>
											{({ field }: any) => (
												<div className="grid gap-2">
													<Label htmlFor="email">
														<T id="email-address" />
													</Label>
													<Input
														{...field}
														id="email"
														ref={emailRef}
														type="email"
														required
														placeholder={intl.formatMessage({
															id: "form.placeholder.email",
														})}
														className={`bg-background/50 py-6 ${errors.email && touched.email ? "border-destructive" : ""}`}
													/>
													{errors.email && touched.email && (
														<p className="text-sm text-destructive">{errors.email}</p>
													)}
												</div>
											)}
										</Field>
									</div>
									<div className="space-y-2">
										<Field name="password" validate={validateString(8, 255)}>
											{({ field }: any) => (
												<div className="grid gap-2">
													<Label htmlFor="password">
														<T id="password" />
													</Label>
													<Input
														{...field}
														id="password"
														type="password"
														autoComplete="current-password"
														required
														maxLength={255}
														placeholder="••••••••"
														className={`bg-background/50 py-6 ${errors.password && touched.password ? "border-destructive" : ""}`}
													/>
													{errors.password && touched.password && (
														<p className="text-sm text-destructive">{errors.password}</p>
													)}
												</div>
											)}
										</Field>
									</div>
									<Button
										type="submit"
										size="lg"
										className="w-full py-6 text-lg bg-primary hover:bg-primary/90 transition-all shadow-lg hover:shadow-primary/25"
										disabled={isSubmitting}
									>
										{isSubmitting ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<T id="sign-in" />
										)}
									</Button>
								</Form>
							)}
						</Formik>
					</CardContent>
				</Card>
				<div className="text-center text-xs text-muted-foreground/50 mt-8 font-mono">{getVersion()}</div>
			</div>
		</div>
	);
}
