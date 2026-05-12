import { Field, type FieldProps } from "formik";
import { Label } from "src/components/ui/label";
import { Textarea } from "src/components/ui/textarea";
import { T } from "src/locale";

interface Props {
	id?: string;
	name?: string;
	label?: string;
}
export function WasmConfigField({ name = "wasmConfig", label, id = "wasmConfig" }: Props) {
	return (
		<Field name={name}>
			{({ field }: FieldProps) => (
				<div className="space-y-2 mt-4 ml-[1px]">
					<Label htmlFor={id}>{label || <T id="wasm-module-arguments" />}</Label>
					<Textarea
						id={id}
						placeholder={T({ id: "wasm-config-placeholder" })}
						className="min-h-[200px] font-mono text-sm bg-[#1e1e1e] text-foreground"
						{...field}
					/>
				</div>
			)}
		</Field>
	);
}
