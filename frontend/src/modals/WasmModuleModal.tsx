import { IconPackages } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers } from "formik";
import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Loading } from "src/components";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import { useSetWasmModule, useWasmModule } from "src/hooks";
import { T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

const showWasmModuleModal = (id: number | "new") => {
	EasyModal.show(WasmModuleModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
	visible: boolean;
	remove: () => void;
}

interface WasmModuleValues {
	name: string;
	description: string;
	wasmFile: File | null;
}

const WasmModuleModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const isNew = id === "new";
	const { data, isLoading } = useWasmModule(isNew ? 0 : (id as number), {
		enabled: visible && !isNew,
	});
	const { mutate: setWasmModule } = useSetWasmModule();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: WasmModuleValues, { setSubmitting }: FormikHelpers<WasmModuleValues>) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload = isNew
			? { name: values.name, description: values.description, wasmFile: values.wasmFile as File }
			: { id: id as number, name: values.name, description: values.description };

		setWasmModule(payload as any, {
			onError: (err: Error) => setErrorMsg(err.message),
			onSuccess: () => {
				showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.WASM_MODULE, isNew ? "created" : "updated");
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
			<DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconPackages className="h-5 w-5" />
						<T id={isNew ? "object.add" : "object.edit"} tData={{ object: "WASM Module" }} />
					</DialogTitle>
				</DialogHeader>

				{isLoading && !isNew ? (
					<Loading noLogo />
				) : (
					<Formik<WasmModuleValues>
						enableReinitialize
						initialValues={{
							name: data?.name || "",
							description: data?.description || "",
							wasmFile: null,
						}}
						onSubmit={onSubmit}
					>
						{({ setFieldValue }) => (
							<Form className="space-y-4 pt-2">
								{errorMsg && (
									<Alert variant="destructive">
										<AlertDescription>{errorMsg}</AlertDescription>
									</Alert>
								)}

								<div className="space-y-2">
									<Label htmlFor="name">
										<T id="column.name" /> *
									</Label>
									<Field name="name" validate={validateString(1, 255)}>
										{({ field, meta }: FieldProps) => (
											<>
												<Input {...field} id="name" />
												{meta.touched && meta.error && (
													<p className="text-sm text-destructive">{meta.error}</p>
												)}
											</>
										)}
									</Field>
								</div>

								<div className="space-y-2">
									<Label htmlFor="description">
										<T id="details" />
									</Label>
									<Field name="description">
										{({ field }: FieldProps) => (
											<Textarea {...field} id="description" className="resize-none" rows={3} />
										)}
									</Field>
								</div>

								{isNew && (
									<div className="space-y-2">
										<Label htmlFor="wasmFile">WASM File (.wasm) *</Label>
										<Input
											id="wasmFile"
											type="file"
											accept=".wasm"
											onChange={(e) => {
												const file = e.currentTarget.files?.[0] || null;
												setFieldValue("wasmFile", file);
											}}
										/>
									</div>
								)}

								<DialogFooter className="pt-2">
									<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
										<T id="cancel" />
									</Button>
									<Button
										type="submit"
										disabled={isSubmitting}
										className="bg-violet-600/90 hover:bg-violet-600 text-white shadow-sm"
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

export { showWasmModuleModal };
