import { IconGhost, IconSettings } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik } from "formik";
import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
	DomainNamesField,
	Loading,
	NginxConfigField,
	SSLCertificateField,
	SSLOptionsFields,
} from "src/components";
import { Button } from "src/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { useDeadHost, useSetDeadHost } from "src/hooks";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";

const showDeadHostModal = (id: number | "new") => {
	EasyModal.show(DeadHostModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}
const DeadHostModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useDeadHost(id);
	const { mutate: setDeadHost } = useSetDeadHost();
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

		setDeadHost(payload, {
			onError: (err: any) => setErrorMsg(<T id={err.message} />),
			onSuccess: () => {
				showObjectSuccess("dead-host", "saved");
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
								domainNames: data?.domainNames,
								certificateId: data?.certificateId,
								sslForced: data?.sslForced,
								advancedConfig: data?.advancedConfig,
								http2Support: data?.http2Support,
								hstsEnabled: data?.hstsEnabled,
								hstsSubdomains: data?.hstsSubdomains,
								meta: data?.meta || {},
							} as any
						}
						onSubmit={onSubmit}
					>
						{({ handleSubmit }) => (
							<Form onSubmit={handleSubmit} className="space-y-4">
								<DialogHeader>
									<DialogTitle className="flex items-center gap-2">
										<IconGhost className="h-5 w-5" />
										<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "dead-host" }} />
									</DialogTitle>
								</DialogHeader>

								{errorMsg && (
									<Alert variant="destructive">
										<AlertTitle>Error</AlertTitle>
										<AlertDescription>{errorMsg}</AlertDescription>
									</Alert>
								)}

								<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
									<TabsList className="grid w-full grid-cols-3">
										<TabsTrigger value="details"><T id="column.details" /></TabsTrigger>
										<TabsTrigger value="ssl"><T id="column.ssl" /></TabsTrigger>
										<TabsTrigger value="advanced">
											<IconSettings size={16} className="mr-2" />
											<span className="sr-only">Settings</span>
										</TabsTrigger>
									</TabsList>

									<div className="mt-4 p-1">
										<TabsContent value="details">
											<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />
										</TabsContent>

										<TabsContent value="ssl">
											<SSLCertificateField
												name="certificateId"
												label="ssl-certificate"
												allowNew
											/>
											<SSLOptionsFields color="bg-red" />
										</TabsContent>

										<TabsContent value="advanced">
											<NginxConfigField />
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
