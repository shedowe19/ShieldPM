import { Field, type FieldProps } from "formik";
import { LazyCodeEditor } from "src/components/LazyCodeEditor";
import { Label } from "src/components/ui/label";
import { intl, T } from "src/locale";

interface Props {
	id?: string;
	name?: string;
	label?: string;
}
export function NginxConfigField({
	name = "advancedConfig",
	label = "nginx-config.label",
	id = "advancedConfig",
}: Props) {
	return (
		<Field name={name}>
			{({ field }: FieldProps) => (
				<div className="space-y-2 mt-4 ml-[1px]">
					<Label htmlFor={id}>
						<T id={label} />
					</Label>
					<div className="rounded-md border overflow-hidden">
						<LazyCodeEditor
							language="nginx"
							placeholder={intl.formatMessage({ id: "nginx-config.placeholder" })}
							padding={15}
							data-color-mode="dark"
							minHeight={200}
							indentWidth={2}
							style={{
								fontFamily:
									"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
								// borderRadius: "0.3rem", // Handled by container
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
