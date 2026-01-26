import { IconCertificate } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { type Certificate, createCertificate, uploadCertificate, validateCertificate } from "src/api/backend";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { Textarea } from "src/components/ui/textarea";
import { T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showCustomCertificateModal = () => {
	EasyModal.show(CustomCertificateModal);
};

const CustomCertificateModal = EasyModal.create(({ visible, remove }: InnerModalProps) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [mode, setMode] = useState<"upload" | "paste">("upload");

	const validatePem = (content: string, type: "PRIVATE KEY" | "CERTIFICATE") => {
		if (!content) return false;
		return content.includes(`-----BEGIN ${type}-----`);
	};

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		try {
			const { niceName, provider } = values;
			const formData = new FormData();

			if (mode === "upload") {
				if (!values.certificate || !values.certificateKey) {
					throw new Error("certificate.errors.missing_files");
				}
				formData.append("certificate", values.certificate);
				formData.append("certificate_key", values.certificateKey);
				if (values.intermediateCertificate) {
					formData.append("intermediate_certificate", values.intermediateCertificate);
				}
			} else {
				// Paste mode validation
				if (!validatePem(values.certificateKeyText, "PRIVATE KEY")) {
					throw new Error("certificate.errors.invalid_key_pem");
				}
				if (!validatePem(values.certificateText, "CERTIFICATE")) {
					throw new Error("certificate.errors.invalid_cert_pem");
				}

				// Convert text to files
				const keyFile = new File([values.certificateKeyText], "privkey.pem", {
					type: "application/x-pem-file",
				});
				const certFile = new File([values.certificateText], "fullchain.pem", {
					type: "application/x-pem-file",
				});

				formData.append("certificate", certFile);
				formData.append("certificate_key", keyFile);

				if (values.intermediateCertificateText) {
					const chainFile = new File([values.intermediateCertificateText], "chain.pem", {
						type: "application/x-pem-file",
					});
					formData.append("intermediate_certificate", chainFile);
				}
			}

			// Validate
			await validateCertificate(formData);

			// Create certificate, as other without anything else
			const cert = await createCertificate({ niceName, provider } as Certificate);

			// Upload the certificates to the created certificate
			await uploadCertificate(cert.id, formData);

			// Success
			showObjectSuccess("certificate", "saved");
			remove();
		} catch (err: any) {
			// If it's a known error key, translate it, otherwise show message
			const isKey = err.message.includes(".") || err.message.includes("_");
			setErrorMsg(isKey ? <T id={err.message} /> : err.message);
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
						<T id="object.add" tData={{ object: "certificates.custom" }} />
					</DialogTitle>
				</DialogHeader>

				<Formik
					initialValues={
						{
							niceName: "",
							provider: "other",
							// Upload fields
							certificate: null,
							certificateKey: null,
							intermediateCertificate: null,
							// Text fields
							certificateText: "",
							certificateKeyText: "",
							intermediateCertificateText: "",
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ errors, touched, setFieldValue }: any) => (
						<Form className="space-y-4">
							{errorMsg && (
								<Alert variant="destructive">
									<AlertCircle className="h-4 w-4" />
									<AlertTitle>Error</AlertTitle>
									<AlertDescription>{errorMsg}</AlertDescription>
								</Alert>
							)}

							<div className="space-y-2">
								<Label htmlFor="niceName">
									<T id="column.name" />
								</Label>
								<Field name="niceName" validate={validateString(1, 255)}>
									{({ field }: any) => (
										<Input
											{...field}
											id="niceName"
											autoComplete="off"
											className={errors.niceName && touched.niceName ? "border-destructive" : ""}
										/>
									)}
								</Field>
								{errors.niceName && touched.niceName && (
									<div className="text-sm text-destructive">{errors.niceName}</div>
								)}
							</div>

							<Tabs value={mode} onValueChange={(v: any) => setMode(v)} className="w-full">
								<TabsList className="grid w-full grid-cols-2">
									<TabsTrigger value="upload">File Upload</TabsTrigger>
									<TabsTrigger value="paste">Paste Input</TabsTrigger>
								</TabsList>

								<TabsContent value="upload" className="space-y-4 pt-4">
									<Card className="border-dashed">
										<CardContent className="p-4 space-y-4">
											<div className="space-y-2">
												<Label htmlFor="certificateKey">
													<T id="certificate.custom-certificate-key" />
												</Label>
												<Input
													id="certificateKey"
													type="file"
													required={mode === "upload"}
													className={`cursor-pointer file:text-foreground ${errors.certificateKey && touched.certificateKey ? "border-destructive" : ""}`}
													onChange={(event) => {
														setFieldValue(
															"certificateKey",
															event.currentTarget.files?.length
																? event.currentTarget.files[0]
																: null,
														);
													}}
												/>
											</div>

											<div className="space-y-2">
												<Label htmlFor="certificate">
													<T id="certificate.custom-certificate" />
												</Label>
												<Input
													id="certificate"
													type="file"
													required={mode === "upload"}
													className={`cursor-pointer file:text-foreground ${errors.certificate && touched.certificate ? "border-destructive" : ""}`}
													onChange={(event) => {
														setFieldValue(
															"certificate",
															event.currentTarget.files?.length
																? event.currentTarget.files[0]
																: null,
														);
													}}
												/>
											</div>

											<div className="space-y-2">
												<Label htmlFor="intermediateCertificate">
													<T id="certificate.custom-intermediate" />
												</Label>
												<Input
													id="intermediateCertificate"
													type="file"
													className={`cursor-pointer file:text-foreground ${errors.intermediateCertificate && touched.intermediateCertificate ? "border-destructive" : ""}`}
													onChange={(event) => {
														setFieldValue(
															"intermediateCertificate",
															event.currentTarget.files?.length
																? event.currentTarget.files[0]
																: null,
														);
													}}
												/>
											</div>
										</CardContent>
									</Card>
								</TabsContent>

								<TabsContent value="paste" className="space-y-4 pt-4">
									<Card className="border-dashed">
										<CardContent className="p-4 space-y-4">
											<div className="space-y-2">
												<Label htmlFor="certificateKeyText">Private Key (PEM)</Label>
												<Field name="certificateKeyText">
													{({ field }: any) => (
														<Textarea
															{...field}
															id="certificateKeyText"
															placeholder="-----BEGIN PRIVATE KEY-----..."
															className="font-mono text-xs min-h-[100px]"
														/>
													)}
												</Field>
											</div>

											<div className="space-y-2">
												<Label htmlFor="certificateText">Certificate Body (PEM)</Label>
												<Field name="certificateText">
													{({ field }: any) => (
														<Textarea
															{...field}
															id="certificateText"
															placeholder="-----BEGIN CERTIFICATE-----..."
															className="font-mono text-xs min-h-[100px]"
														/>
													)}
												</Field>
											</div>

											<div className="space-y-2">
												<Label htmlFor="intermediateCertificateText">
													Intermediate Certificate (Optional)
												</Label>
												<Field name="intermediateCertificateText">
													{({ field }: any) => (
														<Textarea
															{...field}
															id="intermediateCertificateText"
															placeholder="-----BEGIN CERTIFICATE-----..."
															className="font-mono text-xs min-h-[100px]"
														/>
													)}
												</Field>
											</div>
										</CardContent>
									</Card>
								</TabsContent>
							</Tabs>

							<DialogFooter>
								<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									disabled={isSubmitting}
									className="bg-pink-600/90 hover:bg-pink-600 text-white shadow-sm"
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

export { showCustomCertificateModal };
