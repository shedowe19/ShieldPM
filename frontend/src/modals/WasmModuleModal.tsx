import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useEffect } from "react";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { useWasmModule, useSetWasmModule } from "src/hooks";
import { showObjectSuccess } from "src/notifications";
import { Loading } from "src/components";

interface Props extends InnerModalProps {
	id: number | "new";
}

export function WasmModuleModal({ id, visible, hide }: Props) {
	const { data, isLoading } = useWasmModule(id === "new" ? 0 : (id as number), { enabled: visible && id !== "new" });
	const { mutate: setWasmModule, isPending } = useSetWasmModule();

	const isNew = id === "new";

	const createSchema = z.object({
		name: z.string().min(1, "Name is required"),
		description: z.string().optional(),
		wasmFile: z.instanceof(File, { message: "WASM file is required" }),
	});

	const updateSchema = z.object({
		id: z.number(),
		name: z.string().min(1, "Name is required"),
		description: z.string().optional(),
	});

	const schema = isNew ? createSchema : updateSchema;

	const {
		register,
		handleSubmit,
		setValue,
		reset,
		formState: { errors, isSubmitting },
	} = useForm({
		resolver: zodResolver(schema),
		defaultValues: {
			id: isNew ? 0 : data?.id || 0,
			name: data?.name || "",
			description: data?.description || "",
		},
	});

	useEffect(() => {
		if (!isNew && data) {
			reset({
				id: data.id || 0,
				name: data.name || "",
				description: data.description || "",
			});
		}
	}, [data, isNew, reset]);

	const onSubmit = (values: z.infer<typeof schema>) => {
		const submitData = isNew ? { ...values } : { id: data?.id, ...values };

		setWasmModule(submitData as any, {
			onSuccess: () => {
				showObjectSuccess("wasm-module", isNew ? "created" : "updated");
				hide();
			},
		});
	};

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

				<form className="space-y-4 pt-4" onSubmit={handleSubmit(onSubmit)}>
					<div className="space-y-2">
						<Label htmlFor="name">Name *</Label>
						<Input id="name" {...register("name")} />
						{errors.name && <div className="text-sm text-destructive">{errors.name.message}</div>}
					</div>

					<div className="space-y-2">
						<Label htmlFor="description">Description</Label>
						<Textarea id="description" {...register("description")} />
						{errors.description && (
							<div className="text-sm text-destructive">{errors.description.message}</div>
						)}
					</div>

					{isNew && (
						<div className="space-y-2">
							<Label htmlFor="wasmFile">WASM File (.wasm) *</Label>
							<Input
								id="wasmFile"
								type="file"
								accept=".wasm"
								onChange={(event) => {
									const file = event.currentTarget.files?.[0];
									if (file) {
										setValue("wasmFile" as any, file);
									}
								}}
							/>
							{(errors as any).wasmFile && (
								<div className="text-sm text-destructive">
									{(errors as any).wasmFile.message as string}
								</div>
							)}
						</div>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={hide}>
							Cancel
						</Button>
						<Button type="submit" disabled={isSubmitting || isPending}>
							Save
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export const showWasmModuleModal = (id: number | "new") => {
	EasyModal.show(WasmModuleModal, { id });
};
