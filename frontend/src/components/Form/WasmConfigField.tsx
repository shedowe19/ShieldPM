import CodeEditor from "@uiw/react-textarea-code-editor";
import { Field, type FieldProps } from "formik";
import { Label } from "src/components/ui/label";

interface Props {
	id?: string;
	name?: string;
	label?: string;
}
export function WasmConfigField({
	name = "wasmConfig",
	label = "WASM Module Arguments",
	id = "wasmConfig",
}: Props) {
	return (
		<Field name={name}>
			{({ field }: FieldProps) => (
				<div className="space-y-2 mt-4 ml-[1px]">
					<Label htmlFor={id}>
						{label}
					</Label>
					<div className="rounded-md border overflow-hidden">
						<CodeEditor
							language="nginx"
							placeholder="# Proxy-Wasm Configuration\n# wasm_call 'my_plugin' 'hello_world';"
							padding={15}
							data-color-mode="dark"
							minHeight={200}
							indentWidth={2}
							style={{
								fontFamily:
									"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
								minHeight: "200px",
								backgroundColor: "#1e1e1e",
							}}
							{...field}
						/>
					</div>
				</div>
			)}
		</Field>
	);
}
