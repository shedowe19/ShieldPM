import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers } from "formik";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { useWasmModule, useSetWasmModule } from "src/hooks";
import { T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import { Loading } from "src/components";

export const showWasmModuleModal = EasyModal.create(WasmModuleModal);

interface Props extends InnerModalProps {
	id?: number | "new";
}

export function WasmModuleModal({ id, visible, hide }: Props) {
	const { data, isLoading } = useWasmModule(id === "new" ? 0 : (id as number), { enabled: visible && id !== "new" });
	const { mutate: setWasmModule, isPending } = useSetWasmModule();

	const isNew = id === "new";

	if (isLoading) {
		return (
			<Dialog open={visible} onOpenChange={hide}>
				<DialogContent>
					<Loading />
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={visible} onOpenChange={hide}>
			<DialogContent className="sm:max-w-[500px]">
				<DialogHeader>
					<DialogTitle>{isNew ? "Add WASM Module" : "Edit WASM Module"}</DialogTitle>
				</DialogHeader>

				<Formik
					initialValues={{
						id: isNew ? 0 : data?.id || 0,
						name: data?.name || "",
						description: data?.description || "",
						wasmFile: null as File | null,
					}}
					onSubmit={(values: any, { setSubmitting }: FormikHelpers<any>) => {
						setWasmModule(values, {
							onSuccess: () => {
								showObjectSuccess(isNew ? "created" : "updated");
								hide();
							},
							onSettled: () => setSubmitting(false),
						});
					}}
				>
					{({ handleSubmit, setFieldValue, isSubmitting }) => (
						<Form className="space-y-4 pt-4" onSubmit={handleSubmit}>
							<Field name="name" validate={validateString}>
								{({ field, meta }: FieldProps) => (
									<div className="space-y-2">
										<Label htmlFor="name">Name *</Label>
										<Input id="name" {...field} />
										{meta.touched && meta.error && (
											<div className="text-sm text-destructive">{meta.error}</div>
										)}
									</div>
								)}
							</Field>

							<Field name="description">
								{({ field }: FieldProps) => (
									<div className="space-y-2">
										<Label htmlFor="description">Description</Label>
										<Textarea id="description" {...field} />
									</div>
								)}
							</Field>

							{isNew && (
								<Field name="wasmFile">
									{({ meta }: FieldProps) => (
										<div className="space-y-2">
											<Label htmlFor="wasmFile">WASM File (.wasm) *</Label>
											<Input
												id="wasmFile"
												type="file"
												accept=".wasm"
												onChange={(event) => {
													setFieldValue("wasmFile", event.currentTarget.files?.[0]);
												}}
											/>
											{meta.touched && meta.error && (
												<div className="text-sm text-destructive">{meta.error}</div>
											)}
										</div>
									)}
								</Field>
							)}

							<DialogFooter>
								<Button type="button" variant="outline" onClick={hide}>
									Cancel
								</Button>
								<Button type="submit" disabled={isSubmitting || isPending}>
									Save
								</Button>
							</DialogFooter>
						</Form>
					)}
				</Formik>
			</DialogContent>
		</Dialog>
	);
}
