import { IconWorld } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik, type FormikHelpers } from "formik";
import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { type Certificate, createCertificate } from "src/api/backend";
import { DNSProviderFields, DomainNamesField } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE, CERTIFICATE_PROVIDER } from "src/types/enums";

const showDNSCertificateModal = () => {
	EasyModal.show(DNSCertificateModal);
};

interface DNSCertificateValues {
	domainNames: string[];
	provider: string;
	meta: {
		dnsChallenge: boolean;
		[key: string]: unknown;
	};
}

const DNSCertificateModal = EasyModal.create(({ visible, remove }: InnerModalProps) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: DNSCertificateValues, { setSubmitting }: FormikHelpers<DNSCertificateValues>) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		try {
			await createCertificate(values as unknown as Certificate);
			showObjectSuccess("certificate", "saved");
			remove();
		} catch (err) {
			// If the error message likely contains spaces, use it directly (it's a raw log)
			// Otherwise try to translate it
			const message = err instanceof Error ? err.message : String(err);
			if (message.includes(" ")) {
				setErrorMsg(message);
			} else {
				setErrorMsg(<T id={message} />);
			}
		}
		queryClient.invalidateQueries({ queryKey: ["certificates"] });
		setIsSubmitting(false);
		setSubmitting(false);
	};

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-lg">
				<Formik
					initialValues={
						{
							domainNames: [] as string[],
							provider: CERTIFICATE_PROVIDER.LETSENCRYPT,
							meta: {
								dnsChallenge: true,
							},
						} as DNSCertificateValues
					}
					onSubmit={onSubmit}
				>
					{({ handleSubmit }) => (
						<Form onSubmit={handleSubmit}>
							<DialogHeader>
								<DialogTitle className="flex items-center gap-2">
									<IconWorld className="h-5 w-5" />
									<T id="object.add" tData={{ object: AUDIT_LOG_OBJECT_TYPE.CERTIFICATE }} />
								</DialogTitle>
							</DialogHeader>

							<div className="py-4 space-y-4">
								{errorMsg && (
									<Alert variant="destructive">
										<AlertTitle>Error</AlertTitle>
										<AlertDescription>
											{typeof errorMsg === "string" && errorMsg.includes(" ") ? (
												<div className="whitespace-pre-wrap font-mono text-xs max-h-[200px] overflow-y-auto mt-2">
													{errorMsg}
												</div>
											) : (
												errorMsg
											)}
										</AlertDescription>
									</Alert>
								)}

								<Card className="border-dashed">
									<CardContent className="p-4 space-y-4">
										<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />
										<DNSProviderFields />
									</CardContent>
								</Card>
							</div>

							<DialogFooter>
								<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									disabled={isSubmitting}
									className="bg-pink-600/90 hover:bg-pink-600 text-white shadow-sm"
								>
									{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
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

export { showDNSCertificateModal };
