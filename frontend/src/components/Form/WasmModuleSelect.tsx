import { Field, type FieldProps } from "formik";
import { useWasmModules } from "src/hooks";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { RefreshCw } from "lucide-react";
import { Button } from "src/components/ui/button";

interface Props {
	name?: string;
	label?: string;
	id?: string;
}

export function WasmModuleSelect({ name = "wasmModuleId", label = "WASM Module", id = "wasmModuleId" }: Props) {
	const { data: wasmModules, isFetching, refetch } = useWasmModules();

	return (
		<Field name={name}>
			{({ field, form }: FieldProps) => (
				<div className="space-y-2 mt-4 ml-[1px]">
					<div className="flex items-center gap-2">
						<Label htmlFor={id}>{label}</Label>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="h-6 w-6 ml-auto"
							onClick={(e) => {
								e.preventDefault();
								refetch();
							}}
							disabled={isFetching}
						>
							<RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
						</Button>
					</div>
					<Select
						value={field.value?.toString() || "0"}
						onValueChange={(val) => form.setFieldValue(name, parseInt(val, 10))}
					>
						<SelectTrigger id={id} className="w-full bg-input">
							<SelectValue placeholder="Select a WASM Module..." />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="0">None</SelectItem>
							{wasmModules?.map((mod) => (
								<SelectItem key={mod.id} value={mod.id.toString()}>
									{mod.name} ({mod.filename})
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			)}
		</Field>
	);
}
