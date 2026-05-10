import { IconBolt } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik, type FormikHelpers } from "formik";
import { AlertCircle } from "lucide-react";
import { type ReactNode, useState } from "react";
import { HasPermission, Loading } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { useWasmModule, useWasmModules } from "src/hooks/useWasmModules";
import { T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

export const showWasmModuleModal = (id: number | "new") => {
	EasyModal.show(WasmModuleModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
	visible: boolean;
	remove: () => void;
}

interface FormValues {
	name: string;
	description: string;
	file: File | null;
}

const WasmModuleModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data: modules, isLoading } = useWasmModules();
	const moduleData = id !== "new" && modules ? modules.find((m) => m.id === id) : null;
	const { create, update } = useWasmModule();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);

	const onSubmit = async (values: FormValues, { setSubmitting }: FormikHelpers<FormValues>) => {
		setErrorMsg(null);

		if (id === "new") {
			if (!values.file) {
				setErrorMsg("WASM file is required");
				setSubmitting(false);
				return;
			}
			create.mutate(
				{ data: { name: values.name, description: values.description }, file: values.file },
				{
					onSuccess: () => {
						showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.WASM_MODULE, "saved");
						remove();
					},
					onError: (err: Error) => setErrorMsg(err.message),
					onSettled: () => setSubmitting(false),
				},
			);
		} else {
			update.mutate(
				{ id, data: { name: values.name, description: values.description } },
				{
					onSuccess: () => {
						showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.WASM_MODULE, "saved");
						remove();
					},
					onError: (err: Error) => setErrorMsg(err.message),
					onSettled: () => setSubmitting(false),
				},
			);
		}
	};

	return (
		<Dialog open={visible} onOpenChange={(open: boolean) => !open && remove()}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconBolt className="h-5 w-5 text-primary" />
						<T id={id === "new" ? "object.add" : "object.edit"} tData={{ object: "WASM Module" }} />
					</DialogTitle>
				</DialogHeader>

				{isLoading && id !== "new" ? (
					<div className="py-8">
						<Loading noLogo />
					</div>
				) : (
					<Formik<FormValues>
						initialValues={{
							name: moduleData?.name || "",
							description: moduleData?.description || "",
							file: null as File | null,
						}}
						onSubmit={onSubmit}
					>
						{({ isSubmitting, setFieldValue, values }) => (
							<Form className="space-y-4">
								{errorMsg && (
									<Alert variant="destructive">
										<AlertCircle className="h-4 w-4" />
										<AlertTitle>Error</AlertTitle>
										<AlertDescription>{errorMsg}</AlertDescription>
									</Alert>
								)}

								<div className="space-y-2">
									<Label htmlFor="name">Name</Label>
									<Input
										id="name"
										value={values.name}
										onChange={(e) => setFieldValue("name", e.target.value)}
										required
										autoFocus
									/>
								</div>

								<div className="space-y-2">
									<Label htmlFor="description">Description (Optional)</Label>
									<Input
										id="description"
										value={values.description}
										onChange={(e) => setFieldValue("description", e.target.value)}
									/>
								</div>

								{id === "new" && (
									<div className="space-y-2">
										<Label htmlFor="file">WASM Binary (.wasm)</Label>
										<Input
											id="file"
											type="file"
											accept=".wasm"
											onChange={(e) => {
												if (e.target.files && e.target.files.length > 0) {
													setFieldValue("file", e.target.files[0]);
												}
											}}
											required
										/>
									</div>
								)}

								<DialogFooter className="mt-6">
									<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
										<T id="action.cancel" />
									</Button>
									<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
										<Button type="submit" disabled={isSubmitting}>
											<T id="action.save" />
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
