import { IconSettings } from "@tabler/icons-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { LazyCodeEditor } from "src/components/LazyCodeEditor";
import { Loading } from "src/components/Loading";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { useSetSetting, useSetting } from "src/hooks";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

interface DefaultSiteValues {
	value: string;
	redirect: string;
	html: string;
}

export default function DefaultSite() {
	const { data, isLoading, error } = useSetting("default-site");
	const { mutate: setSetting } = useSetSetting();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: DefaultSiteValues, { setSubmitting }: FormikHelpers<DefaultSiteValues>) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = {
			id: "default-site",
			value: values.value,
			meta: {
				redirect: values.redirect,
				html: values.html,
			},
		};

		setSetting(payload, {
			onError: (err: Error) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.SETTING, "saved");
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	if (!isLoading && error) {
		return (
			<div className="card-body">
				<div className="mb-3">
					<Alert variant="destructive">{error.message}</Alert>
				</div>
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="card-body">
				<div className="mb-3">
					<Loading noLogo />
				</div>
			</div>
		);
	}

	return (
		<Formik
			initialValues={{
				value: (data?.value as string) || "congratulations",
				redirect: (data?.meta?.redirect as string) || "",
				html: (data?.meta?.html as string) || "",
			}}
			onSubmit={onSubmit}
		>
			{({ values }) => (
				<Form>
					<Card className="border-t-4 border-slate-500/50">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<IconSettings className="h-6 w-6" />
								<T id="settings.default-site" />
							</CardTitle>
							<CardDescription>
								<T id="settings.default-site.description" />
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							{errorMsg && (
								<Alert className="border-destructive/50 text-destructive dark:border-destructive [&>svg]:text-destructive">
									<AlertCircle className="h-4 w-4" />
									<AlertTitle>Error</AlertTitle>
									<AlertDescription>{errorMsg}</AlertDescription>
								</Alert>
							)}

							<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
								<Field name="value">
									{({ field, form }: FieldProps) => (
										<>
											{["congratulations", "404", "444", "redirect", "html"].map((option) => (
												<label
													key={option}
													className={`
														relative flex cursor-pointer rounded-lg border bg-card p-4 shadow-sm focus:outline-none 
														${field.value === option ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50"}
													`}
												>
													<input
														type="radio"
														name={field.name}
														value={option}
														className="sr-only"
														checked={field.value === option}
														onChange={(e) => form.setFieldValue(field.name, e.target.value)}
													/>
													<span className="flex flex-1">
														<span className="flex flex-col">
															<span className="block text-sm font-medium text-foreground">
																<T id={`settings.default-site.${option}`} />
															</span>
														</span>
													</span>
													<div
														className={`
															ml-3 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border 
															${field.value === option ? "border-primary" : "border-muted"}
														`}
													>
														{field.value === option && (
															<div className="h-2.5 w-2.5 rounded-full bg-primary" />
														)}
													</div>
												</label>
											))}
										</>
									)}
								</Field>
							</div>

							{values.value === "redirect" && (
								<div className="space-y-2">
									<Label htmlFor="redirect">
										<T id="settings.default-site.redirect" />
									</Label>
									<Field name="redirect" validate={validateString(1, 255)}>
										{({ field, form }: FieldProps) => (
											<>
												<Input
													{...field}
													id="redirect"
													placeholder="https://example.com"
													autoComplete="off"
												/>
												{form.errors.redirect && form.touched.redirect && (
													<p className="text-sm text-destructive">
														{form.errors.redirect as string}
													</p>
												)}
											</>
										)}
									</Field>
								</div>
							)}

							{values.value === "html" && (
								<div className="space-y-2">
									<Label htmlFor="html">
										<T id="settings.default-site.html" />
									</Label>
									<Field name="html" validate={validateString(1)}>
										{({ field }: FieldProps) => (
											<div className="rounded-md border overflow-hidden">
												<LazyCodeEditor
													language="php"
													placeholder={intl.formatMessage({
														id: "settings.default-site.html.placeholder",
													})}
													padding={15}
													data-color-mode="dark"
													minHeight={300}
													style={{
														fontFamily:
															"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
														fontSize: 14,
														backgroundColor: "var(--bg-background)",
													}}
													{...field}
												/>
											</div>
										)}
									</Field>
									{/* Formik error for html field if needed */}
								</div>
							)}

							<div className="flex justify-end pt-4">
								<Button
									type="submit"
									disabled={isSubmitting}
									className="bg-slate-600/90 hover:bg-slate-600 text-white shadow-sm"
								>
									{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
									<T id="save" />
								</Button>
							</div>
						</CardContent>
					</Card>
				</Form>
			)}
		</Formik>
	);
}
