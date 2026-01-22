import { IconArrowsRightLeft } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Loading, SSLCertificateField, SSLOptionsFields } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { useSetStream, useStream } from "src/hooks";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showStreamModal = (id: number | "new") => {
	EasyModal.show(StreamModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}
const StreamModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useStream(id);
	const { mutate: setStream } = useSetStream();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [activeTab, setActiveTab] = useState("details");

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const { ...payload } = {
			id: id === "new" ? undefined : id,
			...values,
		};

		setStream(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				showObjectSuccess("stream", "saved");
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
					<Formik
						initialValues={
							{
								incomingPort: data?.incomingPort,
								forwardingHost: data?.forwardingHost,
								forwardingPort: data?.forwardingPort,
								tcpForwarding: data?.tcpForwarding,
								udpForwarding: data?.udpForwarding,
								certificateId: data?.certificateId,
								meta: data?.meta || {},
							} as any
						}
						onSubmit={onSubmit}
					>
						{({ setFieldValue, errors, touched, handleSubmit }) => (
							<Form onSubmit={handleSubmit} className="space-y-4">
								<DialogHeader>
									<DialogTitle className="flex items-center gap-2">
										<IconArrowsRightLeft className="h-5 w-5" />
										<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "stream" }} />
									</DialogTitle>
								</DialogHeader>

								{errorMsg && (
									<Alert variant="destructive">
										<AlertTitle>Error</AlertTitle>
										<AlertDescription>{errorMsg}</AlertDescription>
									</Alert>
								)}

								<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
									<TabsList className="grid w-full grid-cols-2">
										<TabsTrigger value="details">
											<T id="column.details" />
										</TabsTrigger>
										<TabsTrigger value="ssl">
											<T id="column.ssl" />
										</TabsTrigger>
									</TabsList>

									<div className="mt-4 p-1">
										<TabsContent value="details" className="space-y-4">
											<div className="space-y-2">
												<Label htmlFor="incomingPort">
													<T id="stream.incoming-port" />
												</Label>
												<Field name="incomingPort" validate={validateString(1, 11)}>
													{({ field }: any) => (
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
												{errors.incomingPort && touched.incomingPort && (
													<div className="text-sm text-destructive">
														{String(errors.incomingPort)}
													</div>
												)}
											</div>

											<div className="grid grid-cols-1 md:grid-cols-12 gap-4">
												<div className="md:col-span-8 space-y-2">
													<Label htmlFor="forwardingHost">
														<T id="stream.forward-host" />
													</Label>
													<Field name="forwardingHost" validate={validateString(1, 255)}>
														{({ field }: any) => (
															<Input
																{...field}
																id="forwardingHost"
																required
																placeholder={intl.formatMessage({
																	id: "stream.forward-host.placeholder",
																})}
																className={
																	errors.forwardingHost && touched.forwardingHost
																		? "border-destructive"
																		: ""
																}
															/>
														)}
													</Field>
													{errors.forwardingHost && touched.forwardingHost && (
														<div className="text-sm text-destructive">
															{String(errors.forwardingHost)}
														</div>
													)}
												</div>
												<div className="md:col-span-4 space-y-2">
													<Label htmlFor="forwardingPort">
														<T id="host.forward-port" />
													</Label>
													<Field name="forwardingPort" validate={validateString(0, 12)}>
														{({ field }: any) => (
															<Input
																{...field}
																id="forwardingPort"
																placeholder="eg: 8081"
																className={
																	errors.forwardingPort && touched.forwardingPort
																		? "border-destructive"
																		: ""
																}
															/>
														)}
													</Field>
													{errors.forwardingPort && touched.forwardingPort && (
														<div className="text-sm text-destructive">
															{String(errors.forwardingPort)}
														</div>
													)}
												</div>
											</div>

											<div className="my-4">
												<h3 className="text-lg font-medium py-2">
													<T id="host.flags.protocols" />
												</h3>
												<div className="space-y-4">
													<div className="flex items-center justify-between">
														<Label
															htmlFor="tcpForwarding"
															className="cursor-pointer font-normal"
														>
															<T id="streams.tcp" />
														</Label>
														<Field name="tcpForwarding" type="checkbox">
															{({ field }: any) => (
																<Switch
																	id="tcpForwarding"
																	checked={field.value}
																	onCheckedChange={(checked) => {
																		setFieldValue(field.name, checked);
																		if (!checked) {
																			setFieldValue("udpForwarding", true);
																		}
																	}}
																/>
															)}
														</Field>
													</div>
													<div className="flex items-center justify-between">
														<Label
															htmlFor="udpForwarding"
															className="cursor-pointer font-normal"
														>
															<T id="streams.udp" />
														</Label>
														<Field name="udpForwarding" type="checkbox">
															{({ field }: any) => (
																<Switch
																	id="udpForwarding"
																	checked={field.value}
																	onCheckedChange={(checked) => {
																		setFieldValue(field.name, checked);
																		if (!checked) {
																			setFieldValue("tcpForwarding", true);
																		}
																	}}
																/>
															)}
														</Field>
													</div>
												</div>
											</div>
										</TabsContent>

										<TabsContent value="ssl">
											<SSLCertificateField
												name="certificateId"
												label="ssl-certificate"
												allowNew
												forHttp={false}
											/>
											<SSLOptionsFields
												color="bg-blue"
												forHttp={false}
												forceDNSForNew
												requireDomainNames
											/>
										</TabsContent>
									</div>
								</Tabs>

								<DialogFooter>
									<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
										<T id="cancel" />
									</Button>
									<Button
										type="submit"
										className="bg-blue-600/90 hover:bg-blue-600 text-white shadow-sm"
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

export { showStreamModal };
