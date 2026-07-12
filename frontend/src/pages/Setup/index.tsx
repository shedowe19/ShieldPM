import { useQueryClient } from "@tanstack/react-query";
import {
	Field,
	type FieldProps,
	Form,
	Formik,
	type FormikErrors,
	type FormikHelpers,
	type FormikTouched,
} from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { createUser } from "src/api/backend";
import { LocalePicker } from "src/components/LocalePicker";
import { ThemeSwitcher } from "src/components/ThemeSwitcher";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { useAuthState } from "src/context";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";

interface Payload {
	name: string;
	email: string;
	password: string;
}

export default function Setup() {
	const queryClient = useQueryClient();
	const { login } = useAuthState();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);

	const onSubmit = async (values: Payload, { setSubmitting }: FormikHelpers<Payload>) => {
		setErrorMsg(null);

		// Set a nickname, which is the first word of the name
		const nickname = values.name.split(" ")[0];

		const { password, ...payload } = {
			...values,
			...{
				nickname,
				auth: {
					type: "password",
					secret: values.password,
				},
			},
		};

		try {
			const user = await createUser(payload, true);
			if (user?.id) {
				try {
					await login(user.email, password);
					// Trigger a Health change
					await queryClient.refetchQueries({ queryKey: ["health"] });
					// window.location.reload();
				} catch (err) {
					if (err instanceof Error) setErrorMsg(err.message);
				}
			} else {
				setErrorMsg("cannot_create_user");
			}
		} catch (err) {
			if (err instanceof Error) setErrorMsg(err.message);
		}
		setSubmitting(false);
	};

	return (
		<div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
			<div className="absolute top-4 right-4 flex gap-2">
				<LocalePicker />
				<ThemeSwitcher />
			</div>

			<div className="w-full max-w-md space-y-8">
				<div className="flex justify-center">
					<img
						className="h-12 w-auto dark:invert"
						src="/images/logo-text-horizontal-grey.png"
						alt="ShieldPM"
					/>
				</div>

				<Card>
					<CardHeader className="text-center">
						<CardTitle className="text-2xl">
							<T id="setup.title" />
						</CardTitle>
						<CardDescription>
							<T id="setup.preamble" />
						</CardDescription>
					</CardHeader>
					<CardContent>
						{errorMsg && (
							<Alert variant="destructive" className="mb-6">
								<AlertCircle className="h-4 w-4" />
								<AlertTitle>Error</AlertTitle>
								<AlertDescription>{errorMsg}</AlertDescription>
							</Alert>
						)}

						<Formik
							initialValues={{
								name: "",
								email: "",
								password: "",
							}}
							onSubmit={onSubmit}
						>
							{({
								isSubmitting,
								errors,
								touched,
							}: FormikHelpers<Payload> & {
								isSubmitting: boolean;
								errors: FormikErrors<Payload>;
								touched: FormikTouched<Payload>;
							}) => (
								<Form className="space-y-4">
									<div className="space-y-2">
										<Label htmlFor="name">
											<T id="user.full-name" />
										</Label>
										<Field name="name" validate={validateString(1, 50)}>
											{({ field }: FieldProps) => (
												<Input
													{...field}
													id="name"
													placeholder={intl.formatMessage({ id: "user.full-name" })}
													className={errors.name && touched.name ? "border-destructive" : ""}
												/>
											)}
										</Field>
										{errors.name && touched.name && (
											<p className="text-sm text-destructive">{errors.name}</p>
										)}
									</div>

									<div className="space-y-2">
										<Label htmlFor="email">
											<T id="email-address" />
										</Label>
										<Field name="email" validate={validateEmail()}>
											{({ field }: FieldProps) => (
												<Input
													{...field}
													id="email"
													type="email"
													placeholder={intl.formatMessage({ id: "email-address" })}
													className={
														errors.email && touched.email ? "border-destructive" : ""
													}
												/>
											)}
										</Field>
										{errors.email && touched.email && (
											<p className="text-sm text-destructive">{errors.email}</p>
										)}
									</div>

									<div className="space-y-2">
										<Label htmlFor="password">
											<T id="user.new-password" />
										</Label>
										<Field name="password" validate={validateString(8, 100)}>
											{({ field }: FieldProps) => (
												<Input
													{...field}
													id="password"
													type="password"
													autoComplete="new-password"
													placeholder={intl.formatMessage({ id: "user.new-password" })}
													className={
														errors.password && touched.password ? "border-destructive" : ""
													}
												/>
											)}
										</Field>
										{errors.password && touched.password && (
											<p className="text-sm text-destructive">{errors.password}</p>
										)}
									</div>

									<Button type="submit" className="w-full" disabled={isSubmitting}>
										{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
										<T id="save" />
									</Button>
								</Form>
							)}
						</Formik>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
