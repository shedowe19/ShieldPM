import { IconAlertTriangle, IconCertificate } from "@tabler/icons-react";
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

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		try {
			const { niceName, provider, certificate, certificateKey, intermediateCertificate } = values;
			const formData = new FormData();

			formData.append("certificate", certificate);
			formData.append("certificate_key", certificateKey);
			if (intermediateCertificate !== null) {
				formData.append("intermediate_certificate", intermediateCertificate);
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
			setErrorMsg(<T id={err.message} />);
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
							certificate: null,
							certificateKey: null,
							intermediateCertificate: null,
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

							<Card className="border-dashed">
								<CardContent className="p-4 space-y-4">
									<Alert
										variant="default"
										className="bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-400"
									>
										<IconAlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
										<AlertDescription className="ml-2">
											<T id="certificates.custom.warning" />
										</AlertDescription>
									</Alert>

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
													className={
														errors.niceName && touched.niceName ? "border-destructive" : ""
													}
												/>
											)}
										</Field>
										{errors.niceName && touched.niceName && (
											<div className="text-sm text-destructive">{errors.niceName}</div>
										)}
									</div>

									<div className="space-y-2">
										<Label htmlFor="certificateKey">
											<T id="certificate.custom-certificate-key" />
										</Label>
										<Input
											id="certificateKey"
											type="file"
											required
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
										{errors.certificateKey && touched.certificateKey && (
											<div className="text-sm text-destructive">{errors.certificateKey}</div>
										)}
									</div>

									<div className="space-y-2">
										<Label htmlFor="certificate">
											<T id="certificate.custom-certificate" />
										</Label>
										<Input
											id="certificate"
											type="file"
											required
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
										{errors.certificate && touched.certificate && (
											<div className="text-sm text-destructive">{errors.certificate}</div>
										)}
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
										{errors.intermediateCertificate && touched.intermediateCertificate && (
											<div className="text-sm text-destructive">
												{errors.intermediateCertificate}
											</div>
										)}
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
