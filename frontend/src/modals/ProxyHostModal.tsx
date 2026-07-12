import { IconBolt, IconGitBranch, IconNote, IconSettings, IconShieldLock, IconTool } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { ProxyHost } from "src/api/backend";
import { GitSyncTab, HasPermission, Loading, LocationsFields, NoteWarning } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { useProxyHost, useSetProxyHost, useUser } from "src/hooks";
import { T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE, FORWARD_SCHEME, PROXY_HOST_TAB } from "src/types/enums";
import ProxyHostAdvancedTab from "./ProxyHostAdvancedTab";
import ProxyHostDetailsTab from "./ProxyHostDetailsTab";
import ProxyHostMaintenanceTab from "./ProxyHostMaintenanceTab";
import { createProxyHostInitialValues, type ProxyHostFormValues } from "./ProxyHostModalFormValues";
import ProxyHostNotesTab from "./ProxyHostNotesTab";
import ProxyHostSecurityTab from "./ProxyHostSecurityTab";
import ProxyHostSslTab from "./ProxyHostSslTab";

const showProxyHostModal = (id: number | "new") => {
	EasyModal.show(ProxyHostModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
	visible: boolean;
	remove: () => void;
}

const ProxyHostModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data: currentUser, isLoading: userIsLoading, error: userError } = useUser("me");
	const { data, isLoading, error } = useProxyHost(id);
	const { mutate: setProxyHost } = useSetProxyHost();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: ProxyHostFormValues, { setSubmitting }: FormikHelpers<ProxyHostFormValues>) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		// Sanitize numeric fields that can be null
		const sanitizedValues = { ...values };
		if (sanitizedValues.advLimitReqRate === "" || Number.isNaN(Number(sanitizedValues.advLimitReqRate))) {
			sanitizedValues.advLimitReqRate = undefined;
		}
		if (sanitizedValues.advLimitReqBurst === "" || Number.isNaN(Number(sanitizedValues.advLimitReqBurst))) {
			sanitizedValues.advLimitReqBurst = undefined;
		}

		// Map frontend field to backend schema
		if (typeof sanitizedValues.crowdsecEnabled !== "undefined") {
			sanitizedValues.securityCrowdsec = sanitizedValues.crowdsecEnabled;
			delete sanitizedValues.crowdsecEnabled;
		}

		// Don't overwrite git credentials with empty string (user didn't change them)
		if (sanitizedValues.gitCredentials === "") {
			delete sanitizedValues.gitCredentials;
		}

		const { ...payload } = {
			id: id === "new" ? undefined : id,
			...sanitizedValues,
		};

		setProxyHost(payload as unknown as ProxyHost, {
			onError: (err: Error) => setErrorMsg(err.message ? <T id={err.message} /> : "Unknown error"),
			onSuccess: () => {
				showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Dialog open={visible} onOpenChange={(open: boolean) => !open && remove()}>
			<DialogContent className="max-h-[90vh] max-w-4xl p-0 gap-0 overflow-hidden flex flex-col">
				{!isLoading && (error || userError) && (
					<Alert variant="destructive" className="m-3">
						<AlertCircle className="h-4 w-4" />
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{error?.message || userError?.message || "Unknown error"}</AlertDescription>
					</Alert>
				)}
				{(isLoading || userIsLoading) && (
					<div className="p-8">
						<Loading noLogo />
					</div>
				)}
				{!isLoading && !userIsLoading && data && currentUser && (
					<Formik initialValues={createProxyHostInitialValues(data)} enableReinitialize onSubmit={onSubmit}>
						{() => (
							<Form className="flex flex-col h-full overflow-hidden">
								<DialogHeader className="px-6 py-4 border-b">
									<DialogTitle className="flex items-center gap-2 text-xl">
										<IconBolt className="h-6 w-6 text-primary" />
										<T
											id={data?.id ? "object.edit" : "object.add"}
											tData={{ object: AUDIT_LOG_OBJECT_TYPE.PROXY_HOST }}
										/>
									</DialogTitle>
								</DialogHeader>

								<div className="px-6 pt-4">
									<NoteWarning content={data?.note} />
								</div>

								<Tabs defaultValue={PROXY_HOST_TAB.DETAILS} className="flex-1 flex flex-col min-h-0">
									<div className="px-6 pt-4">
										<TabsList className="w-full justify-start">
											<TabsTrigger value={PROXY_HOST_TAB.DETAILS}>
												<T id="column.details" />
											</TabsTrigger>
											<TabsTrigger value={PROXY_HOST_TAB.LOCATIONS}>
												<T id="column.custom-locations" />
											</TabsTrigger>
											<TabsTrigger value={PROXY_HOST_TAB.SSL}>
												<T id="column.ssl" />
											</TabsTrigger>
											<TabsTrigger value={PROXY_HOST_TAB.SECURITY}>
												<IconShieldLock size={20} />
											</TabsTrigger>
											<TabsTrigger value={PROXY_HOST_TAB.ADVANCED} className="ml-auto">
												<IconSettings size={20} />
											</TabsTrigger>
											<TabsTrigger value={PROXY_HOST_TAB.MAINTENANCE}>
												<IconTool size={20} />
											</TabsTrigger>
											<TabsTrigger value={PROXY_HOST_TAB.NOTES}>
												<IconNote size={20} />
											</TabsTrigger>
											<Field name="forwardScheme">
												{({ field: schemeField }: FieldProps) =>
													schemeField.value === FORWARD_SCHEME.PATH && (
														<TabsTrigger
															value={PROXY_HOST_TAB.GIT_SYNC}
															className="text-emerald-500"
														>
															<IconGitBranch size={20} />
														</TabsTrigger>
													)
												}
											</Field>
										</TabsList>
									</div>

									<div className="flex-1 overflow-y-auto">
										<div className="px-6 py-4">
											{errorMsg && (
												<Alert variant="destructive" className="mb-4">
													<AlertCircle className="h-4 w-4" />
													<AlertTitle>Error</AlertTitle>
													<AlertDescription>{errorMsg}</AlertDescription>
												</Alert>
											)}
											<ProxyHostDetailsTab />
											<TabsContent value={PROXY_HOST_TAB.LOCATIONS} className="mt-0">
												<LocationsFields initialValues={data?.locations || []} />
											</TabsContent>
											<ProxyHostSslTab />
											<ProxyHostSecurityTab />

											<ProxyHostAdvancedTab />

											<ProxyHostMaintenanceTab />

											<ProxyHostNotesTab />

											<Field name="forwardScheme">
												{({ field: schemeField }: FieldProps) =>
													schemeField.value === FORWARD_SCHEME.PATH && (
														<TabsContent
															value={PROXY_HOST_TAB.GIT_SYNC}
															className="mt-0 space-y-4"
														>
															<GitSyncTab hostId={typeof id === "number" ? id : null} />
														</TabsContent>
													)
												}
											</Field>
										</div>
									</div>
								</Tabs>

								<DialogFooter className="px-6 py-4 border-t">
									<Button variant="outline" onClick={() => remove()} type="button">
										<T id="cancel" />
									</Button>
									<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
										<Button
											type="submit"
											variant="default"
											className="bg-lime-600/90 text-white hover:bg-lime-600 shadow-sm"
											disabled={isSubmitting}
										>
											{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
											<T id="save" />
										</Button>
									</HasPermission>
								</DialogFooter>
							</Form>
						)}
					</Formik>
				)}
			</DialogContent>
		</Dialog>
	);
});

export { showProxyHostModal };
