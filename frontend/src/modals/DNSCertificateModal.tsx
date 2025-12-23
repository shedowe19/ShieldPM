import { IconWorld } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik } from "formik";
import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { createCertificate } from "src/api/backend";
import { DNSProviderFields, DomainNamesField } from "src/components";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Alert, AlertTitle, AlertDescription } from "src/components/ui/alert";
import { Card, CardContent } from "src/components/ui/card";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

const showDNSCertificateModal = () => {
	EasyModal.show(DNSCertificateModal);
};

const DNSCertificateModal = EasyModal.create(({ visible, remove }: InnerModalProps) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		try {
			await createCertificate(values);
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
			<DialogContent className="sm:max-w-lg">
				<Formik
					initialValues={
						{
							domainNames: [],
							provider: "letsencrypt",
							meta: {
								dnsChallenge: true,
							},
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ handleSubmit }) => (
						<Form onSubmit={handleSubmit}>
							<DialogHeader>
								<DialogTitle className="flex items-center gap-2">
									<IconWorld className="h-5 w-5" />
									<T id="object.add" tData={{ object: "lets-encrypt-via-dns" }} />
								</DialogTitle>
							</DialogHeader>

							<div className="py-4 space-y-4">
								{errorMsg && (
									<Alert variant="destructive">
										<AlertTitle>Error</AlertTitle>
										<AlertDescription>{errorMsg}</AlertDescription>
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
