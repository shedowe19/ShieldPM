import { IconCertificate, IconShieldLock } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { type Certificate, createCertificate } from "src/api/backend";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Textarea } from "src/components/ui/textarea";
import { intl, T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

const showInternalCertificateModal = () => {
	EasyModal.show(InternalCertificateModal);
};

const InternalCertificateModal = EasyModal.create(({ visible, remove }: InnerModalProps) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		try {
			if (values.type === "client") {
				// Client Certificate Download
				// Use AuthStore to get the current token
				const response = await fetch("/api/nginx/certificates/internal/client", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						common_name: values.domain_names, // Reusing field
						password: values.password,
						years: Number.parseInt(values.years, 10),
					}),
				});

				if (!response.ok) {
					const err = await response.json();
					throw new Error(err.error?.message || "Failed to generate certificate");
				}

				// Trigger Download
				const blob = await response.blob();
				const url = window.URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = `${values.domain_names}.p12`;
				document.body.appendChild(a);
				a.click();
				window.URL.revokeObjectURL(url);

				showObjectSuccess("certificate", "downloaded"); // Custom message?
				remove();
			} else {
				// Server Certificate (Existing Logic)
				await createCertificate({
					provider: "internal",
					domain_names: values.domain_names.split(/\s+|,/).filter((d: string) => d.trim().length > 0),
					meta: {
						years: Number.parseInt(values.years, 10),
					},
				} as unknown as Certificate);

				showObjectSuccess("certificate", "saved");
				remove();
			}
		} catch (err: any) {
			setErrorMsg(err.message || "An error occurred");
		}

		queryClient.invalidateQueries({ queryKey: ["certificates"] });
		setIsSubmitting(false);
		setSubmitting(false);
	};

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconCertificate className="h-5 w-5" />
						<span>
							<T id="certificates.internal.add" />
						</span>
					</DialogTitle>
				</DialogHeader>

				<Formik
					initialValues={{
						type: "server",
						domain_names: "",
						password: "",
						years: "10",
					}}
					onSubmit={onSubmit}
				>
					{({ errors, touched, setFieldValue, values }: any) => (
						<Form className="space-y-4">
							{errorMsg && (
								<Alert variant="destructive">
									<AlertCircle className="h-4 w-4" />
									<AlertTitle>
										<T id="notification.error" />
									</AlertTitle>
									<AlertDescription>{errorMsg}</AlertDescription>
								</Alert>
							)}

							<Card className="bg-muted/50">
								<CardContent className="p-4 space-y-4">
									<Alert className="bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
										<IconShieldLock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
										<AlertTitle className="ml-2 font-semibold">
											<T id="certificates.internal.post_quantum_title" />
										</AlertTitle>
										<AlertDescription className="ml-2">
											<T id="certificates.internal.post_quantum_desc" />
										</AlertDescription>
									</Alert>

									<div className="space-y-2">
										<Label htmlFor="type">
											<T id="certificates.internal.type" />
										</Label>
										<Select
											onValueChange={(val) => setFieldValue("type", val)}
											defaultValue={values.type}
										>
											<SelectTrigger>
												<SelectValue
													placeholder={intl.formatMessage({
														id: "certificates.internal.type",
													})}
												/>
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="server">
													<T id="certificates.internal.type.server" />
												</SelectItem>
												<SelectItem value="client">
													<T id="certificates.internal.type.client" />
												</SelectItem>
											</SelectContent>
										</Select>
									</div>

									<div className="space-y-2">
										<Label htmlFor="domain_names">
											{values.type === "client" ? (
												<T id="certificates.internal.identity_name" />
											) : (
												<T id="domain-names" />
											)}
										</Label>
										<Field name="domain_names">
											{({ field }: any) => (
												<Textarea
													{...field}
													id="domain_names"
													placeholder={
														values.type === "client"
															? "my-laptop"
															: "example.internal, svc.local"
													}
													className={
														errors.domain_names && touched.domain_names
															? "border-destructive"
															: ""
													}
													rows={values.type === "client" ? 1 : 3}
												/>
											)}
										</Field>
										<p className="text-sm text-muted-foreground">
											{values.type === "client" ? (
												<T id="certificates.internal.identity_help" />
											) : (
												<T id="certificates.internal.domain_names_help" />
											)}
										</p>
									</div>

									{values.type === "client" && (
										<div className="space-y-2">
											<Label htmlFor="password">
												<T id="certificates.internal.password" />
											</Label>
											<Field name="password">
												{({ field }: any) => (
													<Input
														{...field}
														type="password"
														id="password"
														placeholder="VerySecurePassword123!"
														autoComplete="new-password"
													/>
												)}
											</Field>
											<p className="text-sm text-muted-foreground">
												<T id="certificates.internal.password_help" />
											</p>
										</div>
									)}

									<div className="space-y-2">
										<Label htmlFor="years">
											<T id="certificates.internal.validity" />
										</Label>
										<Select
											onValueChange={(val) => setFieldValue("years", val)}
											defaultValue={values.years}
										>
											<SelectTrigger>
												<SelectValue placeholder="Select duration" />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="1">
													<T id="str.years" data={{ count: 1 }} />
												</SelectItem>
												<SelectItem value="5">
													<T id="str.years" data={{ count: 5 }} />
												</SelectItem>
												<SelectItem value="10">
													<T id="str.years" data={{ count: 10 }} />
												</SelectItem>
											</SelectContent>
										</Select>
									</div>
								</CardContent>
							</Card>

							<DialogFooter>
								<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									disabled={isSubmitting}
									className="bg-primary text-primary-foreground shadow-sm"
								>
									{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
									<T id="save" />
								</Button>
							</DialogFooter>
						</Form>
					)}
				</Formik>
			</DialogContent>
		</Dialog>
	);
});

export { showInternalCertificateModal };
