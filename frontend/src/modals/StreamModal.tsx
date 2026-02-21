import { IconArrowsRightLeft, IconNote } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers } from "formik";
import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { Stream } from "src/api/backend";
import { Loading, NoteWarning, SSLCertificateField, SSLOptionsFields } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { Textarea } from "src/components/ui/textarea";
import { useSetStream, useStream } from "src/hooks";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE, STREAM_TAB } from "src/types/enums";

const showStreamModal = (id: number | "new") => {
	EasyModal.show(StreamModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
	visible: boolean;
	remove: () => void;
}

interface StreamValues {
	incomingPort: string;
	forwardingHost: string;
	forwardingPort: string;
	tcpForwarding: boolean;
	udpForwarding: boolean;
	certificateId: number;
	meta: Record<string, unknown>;
	note: string;
}

const StreamModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useStream(id);
	const { mutate: setStream } = useSetStream();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: StreamValues, { setSubmitting }: FormikHelpers<StreamValues>) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		// We need to ensure ports are numbers for the API
		const payload = {
			...values,
			id: id === "new" ? undefined : id,
			incomingPort: Number(values.incomingPort),
			forwardingPort: Number(values.forwardingPort),
		};

		setStream(payload as unknown as Stream, {
			onError: (err: Error) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.STREAM, "saved");
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
					<Formik<StreamValues>
						initialValues={{
							incomingPort: String(data?.incomingPort || ""),
							forwardingHost: data?.forwardingHost || "",
							forwardingPort: String(data?.forwardingPort || ""),
							tcpForwarding: data?.tcpForwarding || false,
							udpForwarding: data?.udpForwarding || false,
							certificateId: data?.certificateId || 0,
							meta: data?.meta || {},
							note: data?.note || "",
						}}
						onSubmit={onSubmit}
					>
						{({ setFieldValue, errors, touched, handleSubmit }) => (
							<Form onSubmit={handleSubmit} className="space-y-4">
								<DialogHeader>
									<DialogTitle className="flex items-center gap-2">
										<IconArrowsRightLeft className="h-5 w-5" />
										<T
											id={data?.id ? "object.edit" : "object.add"}
											tData={{ object: AUDIT_LOG_OBJECT_TYPE.STREAM }}
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

								<Tabs defaultValue={STREAM_TAB.DETAILS} className="w-full">
									<TabsList className="grid w-full grid-cols-3">
										<TabsTrigger value={STREAM_TAB.DETAILS}>
											<T id="details" />
										</TabsTrigger>
										<TabsTrigger value={STREAM_TAB.SSL}>
											<T id="ssl-certificate" />
										</TabsTrigger>
										<TabsTrigger value={STREAM_TAB.NOTES}>
											<IconNote size={20} />
										</TabsTrigger>
									</TabsList>

									<TabsContent value={STREAM_TAB.DETAILS} className="space-y-4 pt-4">
										<div className="space-y-2">
											<Label htmlFor="incomingPort">
												<T id="incomingPort" />
											</Label>
											<Field name="incomingPort" validate={validateString(1, 11)}>
												{({ field }: FieldProps) => (
													<Input
														{...field}
														id="incomingPort"
														required
														placeholder="eg: 8080"
														className={
															errors.incomingPort && touched.incomingPort
																? "border-destructive"
																: ""
														}
													/>
												)}
											</Field>
										</div>

										<div className="grid grid-cols-1 md:grid-cols-12 gap-4">
											<div className="md:col-span-8">
												<Label htmlFor="forwardingHost">
													<T id="forwardingHost" />
												</Label>
												<Field name="forwardingHost" validate={validateString(1, 255)}>
													{({ field }: FieldProps) => (
														<Input
															{...field}
															id="forwardingHost"
															required
															placeholder="eg: 192.168.1.1"
															className={
																errors.forwardingHost && touched.forwardingHost
																	? "border-destructive"
																	: ""
															}
														/>
													)}
												</Field>
											</div>
											<div className="md:col-span-4">
												<Label htmlFor="forwardingPort">
													<T id="forwardingPort" />
												</Label>
												<Field name="forwardingPort" validate={validateString(1, 11)}>
													{({ field }: FieldProps) => (
														<Input
															{...field}
															id="forwardingPort"
															required
															placeholder="eg: 80"
															className={
																errors.forwardingPort && touched.forwardingPort
																	? "border-destructive"
																	: ""
															}
														/>
													)}
												</Field>
											</div>
										</div>

										<div className="flex gap-4">
											<div className="flex items-center space-x-2">
												<Field name="tcpForwarding">
													{({ field }: FieldProps) => (
														<Switch
															id="tcpForwarding"
															checked={field.value}
															onCheckedChange={(checked) =>
																setFieldValue("tcpForwarding", checked)
															}
														/>
													)}
												</Field>
												<Label htmlFor="tcpForwarding">TCP</Label>
											</div>
											<div className="flex items-center space-x-2">
												<Field name="udpForwarding">
													{({ field }: FieldProps) => (
														<Switch
															id="udpForwarding"
															checked={field.value}
															onCheckedChange={(checked) =>
																setFieldValue("udpForwarding", checked)
															}
														/>
													)}
												</Field>
												<Label htmlFor="udpForwarding">UDP</Label>
											</div>
										</div>
									</TabsContent>

									<TabsContent value={STREAM_TAB.SSL} className="pt-4">
										<SSLCertificateField name="certificateId" label="ssl-certificate" allowNew />
										<SSLOptionsFields color="bg-cyan" />
									</TabsContent>

									<TabsContent value={STREAM_TAB.NOTES} className="space-y-4 pt-4">
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
								</Tabs>

								<DialogFooter>
									<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
										<T id="cancel" />
									</Button>
									<Button
										type="submit"
										disabled={isSubmitting}
										className="bg-cyan-600/90 hover:bg-cyan-600 text-white shadow-sm"
									>
										{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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

export { showStreamModal };
