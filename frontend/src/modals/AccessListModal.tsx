import { IconShieldLock } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik, type FormikHelpers } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { AccessList } from "src/api/backend";
import { Loading } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { useAccessList, useSetAccessList } from "src/hooks";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE, UI_COLOR } from "src/types/enums";
import AccessListFormTabs from "./AccessListFormTabs";
import { type AccessListFormValues, createAccessListInitialValues } from "./AccessListModalFormValues";
import { createAccessListPayload } from "./AccessListModalSubmission";
import { validateAccessListForm } from "./AccessListModalValidation";

const showAccessListModal = (id: number | "new") => {
	EasyModal.show(AccessListModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
}

const AccessListModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useAccessList(id, ["items", "clients"]);
	const { mutate: setAccessList } = useSetAccessList();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: AccessListFormValues, { setSubmitting }: FormikHelpers<AccessListFormValues>) => {
		if (isSubmitting) return;

		const vErr = validateAccessListForm(values);
		if (vErr) {
			setErrorMsg(vErr);
			return;
		}

		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = createAccessListPayload({ id, meta: data?.meta, values });

		setAccessList(payload as unknown as AccessList, {
			onError: (err: unknown) => setErrorMsg(typeof err === "string" ? err : (err as Error).message),
			onSuccess: () => {
				showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.ACCESS_LIST, "saved");
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
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconShieldLock className="h-5 w-5" />
						<T
							id={id === "new" ? "object.add" : "object.edit"}
							tData={{ object: AUDIT_LOG_OBJECT_TYPE.ACCESS_LIST }}
						/>
					</DialogTitle>
				</DialogHeader>

				{!isLoading && error && (
					<Alert variant="destructive" className="mb-4">
						<AlertCircle className="h-4 w-4" />
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{error?.message || "Unknown error"}</AlertDescription>
					</Alert>
				)}

				{isLoading && <Loading noLogo />}

				{!isLoading && data && (
					<Formik<AccessListFormValues>
						enableReinitialize
						initialValues={createAccessListInitialValues(data)}
						onSubmit={onSubmit}
					>
						<Form className="space-y-4">
							{errorMsg && (
								<Alert variant="destructive">
									<AlertCircle className="h-4 w-4" />
									<AlertTitle>Error</AlertTitle>
									<AlertDescription>{errorMsg}</AlertDescription>
								</Alert>
							)}

							<AccessListFormTabs clients={data?.clients || []} items={data?.items || []} />

							<DialogFooter>
								<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									disabled={isSubmitting}
									className={`bg-${UI_COLOR.CYAN}-600/90 hover:bg-${UI_COLOR.CYAN}-600 text-white shadow-sm`}
								>
									{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
									<T id="save" />
								</Button>
							</DialogFooter>
						</Form>
					</Formik>
				)}
			</DialogContent>
		</Dialog>
	);
});

export { showAccessListModal };
