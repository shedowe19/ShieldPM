import { IconGhost, IconNote, IconSettings } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers } from "formik";
import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { DeadHost } from "src/api/backend";
import { DomainNamesField, Loading, NoteWarning, SSLCertificateField, SSLOptionsFields } from "src/components";
import { NginxConfigField } from "src/components/Form/NginxConfigField";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Label } from "src/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { Textarea } from "src/components/ui/textarea";
import { useDeadHost, useSetDeadHost } from "src/hooks";
import { intl, T } from "src/locale";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE, DEAD_HOST_TAB } from "src/types/enums";

const showDeadHostModal = (id: number | "new") => {
	EasyModal.show(DeadHostModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}
interface DeadHostValues {
	domainNames: string[];
	certificateId: number;
	sslForced: boolean;
	advancedConfig: string;
	http2Support: boolean;
	hstsEnabled: boolean;
	hstsSubdomains: boolean;
	meta: Record<string, unknown>;
	note: string;
}

const DeadHostModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useDeadHost(id);
	const { mutate: setDeadHost } = useSetDeadHost();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: DeadHostValues, { setSubmitting }: FormikHelpers<DeadHostValues>) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = {
			id: id === "new" ? undefined : id,
			...values,
		};

		setDeadHost(payload as unknown as DeadHost, {
			onError: (err) => {
				if (err instanceof Error) setErrorMsg(<T id={err.message} />);
			},
			onSuccess: () => {
				showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.DEAD_HOST, "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				{isLoading && <Loading noLogo />}

				{!isLoading && error && (
					<Alert variant="destructive" className="mb-4">
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{error?.message || "Unknown error"}</AlertDescription>
					</Alert>
				)}

				{!isLoading && data && (
					<Formik<DeadHostValues>
						initialValues={{
							domainNames: data?.domainNames || [],
							certificateId: data?.certificateId || 0,
							sslForced: data?.sslForced || false,
							advancedConfig: data?.advancedConfig || "",
							http2Support: data?.http2Support || false,
							hstsEnabled: data?.hstsEnabled || false,
							hstsSubdomains: data?.hstsSubdomains || false,
							meta: data?.meta || {},
							note: data?.note || "",
						}}
						onSubmit={onSubmit}
					>
						{({ handleSubmit }) => (
							<Form onSubmit={handleSubmit} className="space-y-4">
								<DialogHeader>
									<DialogTitle className="flex items-center gap-2">
										<IconGhost className="h-5 w-5" />
										<T
											id={data?.id ? "object.edit" : "object.add"}
											tData={{ object: AUDIT_LOG_OBJECT_TYPE.DEAD_HOST }}
										/>
									</DialogTitle>
								</DialogHeader>

								{errorMsg && (
									<Alert variant="destructive">
										<AlertTitle>Error</AlertTitle>
										<AlertDescription>{errorMsg}</AlertDescription>
									</Alert>
								)}

								<div className="mb-4">
									<NoteWarning content={data?.note} />
								</div>

								<Tabs defaultValue={DEAD_HOST_TAB.DETAILS} className="w-full">
									<TabsList className="grid w-full grid-cols-4">
										<TabsTrigger value={DEAD_HOST_TAB.DETAILS}>
											<T id="column.details" />
										</TabsTrigger>
										<TabsTrigger value={DEAD_HOST_TAB.SSL}>
											<T id="column.ssl" />
										</TabsTrigger>
										<TabsTrigger value={DEAD_HOST_TAB.ADVANCED}>
											<IconSettings size={16} className="mr-2" />
											<span className="sr-only">Settings</span>
										</TabsTrigger>
										<TabsTrigger value={DEAD_HOST_TAB.NOTES}>
											<IconNote size={20} />
										</TabsTrigger>
									</TabsList>

									<div className="mt-4 p-1">
										<TabsContent value={DEAD_HOST_TAB.DETAILS}>
											<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />
										</TabsContent>

										<TabsContent value={DEAD_HOST_TAB.SSL}>
											<SSLCertificateField
												name="certificateId"
												label="ssl-certificate"
												allowNew
											/>
											<SSLOptionsFields color="bg-red" />
										</TabsContent>

										<TabsContent value={DEAD_HOST_TAB.ADVANCED}>
											<NginxConfigField />
										</TabsContent>

										<TabsContent value={DEAD_HOST_TAB.NOTES}>
											<Field name="note">
												{({ field }: FieldProps) => (
													<div className="space-y-2 mb-4">
														<Label htmlFor="note">
															<T id="host.note" />
														</Label>
														<Textarea
															id="note"
															placeholder={intl.formatMessage({
																id: "host.note.placeholder",
															})}
															className="min-h-[300px] font-mono text-sm"
															{...field}
														/>
														<p className="text-xs text-muted-foreground">
															<T id="host.note.hint" />
														</p>
													</div>
												)}
											</Field>
										</TabsContent>
									</div>
								</Tabs>

								<DialogFooter>
									<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
										<T id="cancel" />
									</Button>
									<Button
										type="submit"
										className="bg-red-600/90 hover:bg-red-600 text-white shadow-sm"
										disabled={isSubmitting}
									>
										{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
										<T id="save" />
									</Button>
								</DialogFooter>
							</Form>
						)}
					</Formik>
				)}
			</DialogContent>
		</Dialog>
	);
});

export { showDeadHostModal };
