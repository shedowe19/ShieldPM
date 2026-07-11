import { IconPlus, IconSettings, IconTrash } from "@tabler/icons-react";
import CodeEditor from "@uiw/react-textarea-code-editor";
import { useFormikContext } from "formik";
import { useState } from "react";
import type { ProxyLocation } from "src/api/backend";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { intl, T } from "src/locale";
import { FORWARD_SCHEME } from "src/types/enums";

interface Props {
	initialValues: ProxyLocation[];
	name?: string;
}

export function LocationsFields({ initialValues, name = "locations" }: Props) {
	const [values, setValues] = useState<ProxyLocation[]>(initialValues || []);
	const { setFieldValue } = useFormikContext();
	const [advVisible, setAdvVisible] = useState<number[]>([]);

	const blankItem: ProxyLocation = {
		path: "",
		advancedConfig: "",
		forwardQuery: "",
		forwardScheme: FORWARD_SCHEME.HTTP,
		forwardHost: "",
		forwardPort: 80,
	};

	const toggleAdvVisible = (idx: number) => {
		setAdvVisible(advVisible.includes(idx) ? advVisible.filter((i) => i !== idx) : [...advVisible, idx]);
	};

	const handleAdd = () => {
		const newValues = [...values, blankItem];
		setValues(newValues);
		setFieldValue(name, newValues);
	};

	const handleRemove = (idx: number) => {
		const newValues = values.filter((_: ProxyLocation, i: number) => i !== idx);
		setValues(newValues);
		setFormField(newValues);
	};

	const handleChange = (idx: number, field: string, fieldValue: string) => {
		const newValues = values.map((v: ProxyLocation, i: number) => (i === idx ? { ...v, [field]: fieldValue } : v));
		setValues(newValues);
		setFormField(newValues);
	};

	const setFormField = (newValues: ProxyLocation[]) => {
		// Filter out empty paths when saving
		const filtered = newValues; // .filter((v: ProxyLocation) => v?.path?.trim() !== "");
		// Actually formik should hold the current values even if empty, so the user can type.
		// We should probably just update formik state.
		setFieldValue(name, filtered);
	};

	if (values.length === 0) {
		return (
			<div className="text-center py-4">
				<Button type="button" onClick={handleAdd} variant="secondary">
					<IconPlus className="mr-2 h-4 w-4" />
					<T id="action.add-location" />
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4">
			{values.map((item: ProxyLocation, idx: number) => (
				<Card key={`${item.path}-${idx}`}>
					<CardContent className="p-4 space-y-4">
						<div className="flex items-start gap-4">
							<div className="flex-1">
								<Label htmlFor={`path-${idx}`}>
									<T id="form.location" />
								</Label>
								<Input
									id={`path-${idx}`}
									placeholder="/path"
									autoComplete="off"
									value={item.path}
									onChange={(e) => handleChange(idx, "path", e.target.value)}
								/>
							</div>
							<div className="pt-6">
								<Button
									type="button"
									variant="ghost"
									size="icon"
									title={intl.formatMessage({ id: "action.advanced-settings" })}
									aria-label={intl.formatMessage({ id: "action.advanced-settings" })}
									onClick={() => toggleAdvVisible(idx)}
									className={advVisible.includes(idx) ? "bg-muted" : ""}
								>
									<IconSettings className="h-4 w-4" />
								</Button>
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
							<div className="col-span-1">
								<Label htmlFor={`scheme-${idx}`}>
									<T id="host.forward-scheme" />
								</Label>
								<Select
									value={item.forwardScheme}
									onValueChange={(val) => handleChange(idx, "forwardScheme", val)}
								>
									<SelectTrigger id={`scheme-${idx}`}>
										<SelectValue placeholder="http" />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={FORWARD_SCHEME.HTTP}>http</SelectItem>
										<SelectItem value={FORWARD_SCHEME.HTTPS}>https</SelectItem>
										<SelectItem value={FORWARD_SCHEME.PATH}>path</SelectItem>
										<SelectItem value={FORWARD_SCHEME.GRPC}>grpc</SelectItem>
										<SelectItem value={FORWARD_SCHEME.GRPCS}>grpcs</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="col-span-2">
								<Label htmlFor={`host-${idx}`}>
									<T id="proxy-host.forward-host" />
								</Label>
								<Input
									id={`host-${idx}`}
									required
									placeholder={intl.formatMessage({ id: "form.placeholder.forward-host-example" })}
									value={item.forwardHost}
									onChange={(e) => handleChange(idx, "forwardHost", e.target.value)}
								/>
							</div>
							<div className="col-span-1">
								<Label htmlFor={`port-${idx}`}>
									<T id="host.forward-port" />
								</Label>
								<Input
									id={`port-${idx}`}
									type="number"
									min={1}
									max={65535}
									placeholder={intl.formatMessage({ id: "form.placeholder.port-example" })}
									value={item.forwardPort}
									onChange={(e) => handleChange(idx, "forwardPort", e.target.value)}
								/>
							</div>
						</div>

						{advVisible.includes(idx) && (
							<div className="space-y-4 pt-2 border-t mt-2">
								<div>
									<Label htmlFor={`query-${idx}`}>
										<T id="proxy-host.forward-query" />
									</Label>
									<Input
										id={`query-${idx}`}
										placeholder={intl.formatMessage({ id: "form.placeholder.api-key" })}
										value={item.forwardQuery}
										onChange={(e) => handleChange(idx, "forwardQuery", e.target.value)}
									/>
								</div>
								<div>
									<Label>
										<T id="advanced-config" />
									</Label>
									<div className="rounded-md border overflow-hidden">
										<CodeEditor
											language="nginx"
											placeholder={intl.formatMessage({ id: "nginx-config.placeholder" })}
											padding={15}
											data-color-mode="dark"
											minHeight={170}
											value={item.advancedConfig}
											onChange={(e) => handleChange(idx, "advancedConfig", e.target.value)}
											style={{
												fontFamily:
													"ui-monospace,SFMono-Regular,SF Mono,Consolas,Liberation Mono,Menlo,monospace",
												fontSize: 12,
												backgroundColor: "#1e1e1e",
											}}
										/>
									</div>
								</div>
							</div>
						)}

						<div className="flex justify-end">
							<Button type="button" variant="destructive" size="sm" onClick={() => handleRemove(idx)}>
								<IconTrash className="mr-2 h-4 w-4" />
								<T id="action.delete" />
							</Button>
						</div>
					</CardContent>
				</Card>
			))}
			<Button type="button" onClick={handleAdd} variant="secondary">
				<IconPlus className="mr-2 h-4 w-4" />
				<T id="action.add-location" />
			</Button>
		</div>
	);
}
