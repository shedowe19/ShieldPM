import { IconNote, IconRoute, IconSettings } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers, type FormikProps } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { createRedirectionHost, type RedirectionHost, updateRedirectionHost } from "src/api/backend";
import { DomainNamesField, NoteWarning, SSLCertificateField, SSLOptionsFields } from "src/components";
import { NginxConfigField } from "src/components/Form/NginxConfigField";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Switch } from "src/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { Textarea } from "src/components/ui/textarea";
import { useRedirectionHost } from "src/hooks";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE, FORWARD_SCHEME, REDIRECTION_HOST_TAB, UI_COLOR } from "src/types/enums";

const showRedirectionHostModal = (id: number | "new") => {
	EasyModal.show(RedirectionHostModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}

const RedirectionHostModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useRedirectionHost(id);
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (
		values: Partial<RedirectionHost>,
		{ setSubmitting }: FormikHelpers<Partial<RedirectionHost>>,
	) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const { ...payload } = {
			id: id === "new" ? undefined : id,
			...values,
		};

		try {
			if (id === "new") {
				await createRedirectionHost(payload as unknown as RedirectionHost);
			} else {
				await updateRedirectionHost(payload as unknown as RedirectionHost);
			}

			showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.REDIRECTION_HOST, "saved");
			queryClient.invalidateQueries({ queryKey: ["redirection-hosts"] });
			if (id !== "new") {
				queryClient.invalidateQueries({ queryKey: [AUDIT_LOG_OBJECT_TYPE.REDIRECTION_HOST, id] });
			}
			remove();
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setErrorMsg(<T id={message} />);
		} finally {
			setIsSubmitting(false);
			setSubmitting(false);
		}
	};

	if (isLoading && id !== "new") {
		return null;
	}

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconRoute className="h-5 w-5" />
						<T id={id === "new" ? "redirection-hosts.add" : "redirection-hosts.edit"} />
					</DialogTitle>
				</DialogHeader>

				{!isLoading && error && (
					<Alert variant="destructive" className="mb-4">
						<AlertCircle className="h-4 w-4" />
						<AlertTitle>
							<T id="error.title" />
						</AlertTitle>
						<AlertDescription>{error?.message || <T id="error.unknown" />}</AlertDescription>
					</Alert>
				)}

				{!isLoading && (data || id === "new") && (
					<Formik<Partial<RedirectionHost>>
						initialValues={
							{
								// Details tab
								domainNames: data?.domainNames || [],
								forwardDomainName: data?.forwardDomainName || "",
								forwardScheme: data?.forwardScheme || FORWARD_SCHEME.AUTO,
								forwardHttpCode: data?.forwardHttpCode || 301,
								preservePath: data?.preservePath || false,
								blockExploits: data?.blockExploits || false,
								// SSL tab
								certificateId: data?.certificateId || 0,
								sslForced: data?.sslForced || false,
								http2Support: data?.http2Support || false,
								hstsEnabled: data?.hstsEnabled || false,
								hstsSubdomains: data?.hstsSubdomains || false,
								// Advanced tab
								advancedConfig: data?.advancedConfig || "",

								meta: data?.meta || {},
								note: data?.note || "",
							} as Partial<RedirectionHost>
						}
						onSubmit={onSubmit}
					>
						{({ setFieldValue, errors, touched }: FormikProps<Partial<RedirectionHost>>) => (
							<Form className="space-y-4">
								{errorMsg && (
									<Alert variant="destructive">
										<AlertCircle className="h-4 w-4" />
										<AlertTitle>Error</AlertTitle>
										<AlertDescription>{errorMsg}</AlertDescription>
									</Alert>
								)}

								<div className="mb-4">
									<NoteWarning content={data?.note} />
								</div>

								<Tabs defaultValue={REDIRECTION_HOST_TAB.DETAILS} className="w-full">
									<TabsList className="grid w-full grid-cols-4">
										<TabsTrigger value={REDIRECTION_HOST_TAB.DETAILS}>
											<T id="column.details" />
										</TabsTrigger>
										<TabsTrigger value={REDIRECTION_HOST_TAB.SSL}>
											<T id="column.ssl" />
										</TabsTrigger>
										<TabsTrigger value={REDIRECTION_HOST_TAB.ADVANCED}>
											<IconSettings className="h-4 w-4" />
										</TabsTrigger>
										<TabsTrigger value={REDIRECTION_HOST_TAB.NOTES}>
											<IconNote className="h-4 w-4" />
										</TabsTrigger>
									</TabsList>

									<TabsContent value={REDIRECTION_HOST_TAB.DETAILS} className="space-y-4 pt-4">
										<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />

										<div className="grid grid-cols-1 md:grid-cols-12 gap-4">
											<div className="col-span-1 md:col-span-4">
												<Label htmlFor="forwardScheme">
													<T id="host.forward-scheme" />
												</Label>
												<Field name="forwardScheme">
													{({ field }: FieldProps) => (
														<Select
															value={field.value}
															onValueChange={(val) => setFieldValue("forwardScheme", val)}
														>
															<SelectTrigger
																id="forwardScheme"
																className={
																	errors.forwardScheme && touched.forwardScheme
																		? "border-destructive"
																		: ""
																}
															>
																<SelectValue
																	placeholder={intl.formatMessage({ id: "auto" })}
																/>
															</SelectTrigger>
															<SelectContent>
																<SelectItem value={FORWARD_SCHEME.AUTO}>
																	<T id="auto" />
																</SelectItem>
																<SelectItem value={FORWARD_SCHEME.HTTP}>
																	http
																</SelectItem>
																<SelectItem value={FORWARD_SCHEME.HTTPS}>
																	https
																</SelectItem>
															</SelectContent>
														</Select>
													)}
												</Field>
											</div>
											<div className="col-span-1 md:col-span-8">
												<Field name="forwardDomainName" validate={validateString(1, 255)}>
													{({ field }: FieldProps) => (
														<div className="space-y-2">
															<Label htmlFor="forwardDomainName">
																<T id="redirection-host.forward-domain" />
															</Label>
															<Input
																{...field}
																id="forwardDomainName"
																placeholder={intl.formatMessage({
																	id: "form.placeholder.example-domain",
																})}
																className={
																	errors.forwardDomainName &&
																	touched.forwardDomainName
																		? "border-destructive"
																		: ""
																}
															/>
														</div>
													)}
												</Field>
											</div>
										</div>

										<div>
											<Label htmlFor="forwardHttpCode">
												<T id="redirection-host.forward-http-code" />
											</Label>
											<Field name="forwardHttpCode">
												{({ field }: FieldProps) => (
													<Select
														value={String(field.value)}
														onValueChange={(val) =>
															setFieldValue("forwardHttpCode", Number.parseInt(val, 10))
														}
													>
														<SelectTrigger id="forwardHttpCode">
															<SelectValue placeholder="301" />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="300">
																<T id="redirection-hosts.http-code.300" />
															</SelectItem>
															<SelectItem value="301">
																<T id="redirection-hosts.http-code.301" />
															</SelectItem>
															<SelectItem value="302">
																<T id="redirection-hosts.http-code.302" />
															</SelectItem>
															<SelectItem value="303">
																<T id="redirection-hosts.http-code.303" />
															</SelectItem>
															<SelectItem value="307">
																<T id="redirection-hosts.http-code.307" />
															</SelectItem>
															<SelectItem value="308">
																<T id="redirection-hosts.http-code.308" />
															</SelectItem>
														</SelectContent>
													</Select>
												)}
											</Field>
										</div>

										<Card className="border-dashed">
											<CardContent className="p-4 space-y-4">
												<h4 className="font-medium">
													<T id="options" />
												</h4>
												<div className="flex items-center justify-between">
													<Label htmlFor="preservePath" className="cursor-pointer">
														<T id="host.flags.preserve-path" />
													</Label>
													<Field name="preservePath">
														{({ field }: FieldProps) => (
															<Switch
																id="preservePath"
																checked={field.value}
																onCheckedChange={(checked) =>
																	setFieldValue("preservePath", checked)
																}
															/>
														)}
													</Field>
												</div>
												<div className="flex items-center justify-between">
													<Label htmlFor="blockExploits" className="cursor-pointer">
														<T id="host.flags.block-exploits" />
													</Label>
													<Field name="blockExploits">
														{({ field }: FieldProps) => (
															<Switch
																id="blockExploits"
																checked={field.value}
																onCheckedChange={(checked) =>
																	setFieldValue("blockExploits", checked)
																}
															/>
														)}
													</Field>
												</div>
											</CardContent>
										</Card>
									</TabsContent>

									<TabsContent value={REDIRECTION_HOST_TAB.SSL} className="mt-0">
										<SSLCertificateField name="certificateId" label="ssl-certificate" allowNew />
										<SSLOptionsFields color="bg-yellow" />
									</TabsContent>

									<TabsContent value={REDIRECTION_HOST_TAB.ADVANCED} className="mt-0">
										<NginxConfigField />
									</TabsContent>

									<TabsContent value={REDIRECTION_HOST_TAB.NOTES} className="mt-0 space-y-4 pt-4">
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
										className={`bg-${UI_COLOR.YELLOW}-600/90 hover:bg-${UI_COLOR.YELLOW}-600 text-white shadow-sm`}
									>
										{isSubmitting ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<T id="save" />
										)}
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

export { showRedirectionHostModal };
