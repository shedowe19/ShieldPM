import { IconBolt } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik, type FormikHelpers } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { ProxyHost } from "src/api/backend";
import { HasPermission, Loading, NoteWarning } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { useProxyHost, useSetProxyHost, useUser } from "src/hooks";
import { T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import ProxyHostFormTabs from "./ProxyHostFormTabs";
import { createProxyHostInitialValues, type ProxyHostFormValues } from "./ProxyHostModalFormValues";
import { createProxyHostPayload } from "./ProxyHostModalSubmission";

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

		const payload = createProxyHostPayload({ id, values });

		setProxyHost(payload as unknown as ProxyHost, {
			onError: (err: Error) => setErrorMsg(<T id={err.message || "error.unknown"} />),
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
						<AlertTitle>
							<T id="error.title" />
						</AlertTitle>
						<AlertDescription>
							{error?.message || userError?.message || <T id="error.unknown" />}
						</AlertDescription>
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

								<ProxyHostFormTabs
									errorMessage={errorMsg}
									hostId={typeof id === "number" ? id : null}
									locations={data?.locations || []}
								/>

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
