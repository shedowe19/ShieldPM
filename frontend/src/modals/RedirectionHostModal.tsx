import { IconNote, IconRoute } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { AlertCircle } from "lucide-react";
import { type ReactNode, useState } from "react";
import { createRedirectionHost, updateRedirectionHost } from "src/api/backend";
import { DomainNamesField, NginxConfigField, NoteWarning, SSLCertificateField, SSLOptionsFields } from "src/components";
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
	const [activeTab, setActiveTab] = useState("details");

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const { ...payload } = {
			id: id === "new" ? undefined : id,
			...values,
		};

		try {
			if (id === "new") {
				await createRedirectionHost(payload);
			} else {
				await updateRedirectionHost(payload);
			}

			showObjectSuccess("redirection-host", "saved");
			queryClient.invalidateQueries({ queryKey: ["redirection-hosts"] });
			if (id !== "new") {
				queryClient.invalidateQueries({ queryKey: ["redirection-host", id] });
			}
			remove();
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
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
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{error?.message || "Unknown error"}</AlertDescription>
					</Alert>
				)}

				{!isLoading && (data || id === "new") && (
					<Formik
						initialValues={
							{
								// Details tab
								domainNames: data?.domainNames || [],
								forwardDomainName: data?.forwardDomainName || "",
								forwardScheme: data?.forwardScheme || "auto",
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
							} as any
						}
						onSubmit={onSubmit}
					>
						{({ setFieldValue, errors, touched }: any) => (
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

								<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
									<TabsList className="grid w-full grid-cols-4">
										<TabsTrigger value="details">
											<T id="details" />
										</TabsTrigger>
										<TabsTrigger value="ssl">
											<T id="ssl-certificate" />
										</TabsTrigger>
										<TabsTrigger value="advanced">
											<T id="advanced" />
										</TabsTrigger>
										<TabsTrigger value="notes">
											<IconNote size={20} />
										</TabsTrigger>
									</TabsList>

									<TabsContent value="details" className="space-y-4 pt-4">
										<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />

										<div className="grid grid-cols-1 md:grid-cols-12 gap-4">
											<div className="col-span-1 md:col-span-4">
												<Label htmlFor="forwardScheme">
													<T id="host.forward-scheme" />
												</Label>
												<Field name="forwardScheme">
													{({ field }: any) => (
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
																<SelectItem value="auto">
																	<T id="auto" />
																</SelectItem>
																<SelectItem value="http">http</SelectItem>
																<SelectItem value="https">https</SelectItem>
															</SelectContent>
														</Select>
													)}
												</Field>
											</div>
											<div className="col-span-1 md:col-span-8">
												<Field name="forwardDomainName" validate={validateString(1, 255)}>
													{({ field }: any) => (
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
												{({ field }: any) => (
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
														{({ field }: any) => (
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
														{({ field }: any) => (
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

									<TabsContent value="ssl" className="pt-4">
										<SSLCertificateField name="certificateId" label="ssl-certificate" allowNew />
										<SSLOptionsFields color="bg-yellow" />
									</TabsContent>

									<TabsContent value="advanced" className="pt-4">
										<NginxConfigField />
									</TabsContent>

									<TabsContent value="notes" className="pt-4">
										<Field name="note">
											{({ field }: any) => (
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
										className="bg-yellow-600/90 hover:bg-yellow-600 text-white shadow-sm"
									>
										{isSubmitting ? "..." : <T id="save" />}
									</Button>
								</DialogFooter>
							</Form>
						)}
					</Formik>
				)}
			</DialogContent>
		</Dialog >
	);
});

export { showRedirectionHostModal };
