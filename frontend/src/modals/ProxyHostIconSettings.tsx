import { Field, type FieldProps } from "formik";
import { ServiceIcon } from "src/components";
import { Card, CardContent } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { T } from "src/locale";
import { ICON_TYPE } from "src/types/enums";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";

const ProxyHostIconSettings = () => (
	<Card className="my-3 border-dashed border-blue-500/50">
		<CardContent className="p-4">
			<h4 className="pb-2 text-lg font-semibold text-blue-400">
				<T id="proxy-host.icon-settings" />
			</h4>
			<div className="grid grid-cols-12 gap-4">
				<div className="col-span-12 md:col-span-4">
					<Field name="iconType">
						{({ field }: FieldProps) => (
							<div className="space-y-2">
								<Label htmlFor="iconType">
									<T id="proxy-host.icon-type" />
								</Label>
								<Select
									onValueChange={(val: string) =>
										field.onChange({
											target: {
												name: field.name,
												value: val,
											},
										})
									}
									value={field.value || ICON_TYPE.AUTO}
								>
									<SelectTrigger id="iconType">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value={ICON_TYPE.AUTO}>
											<T id="proxy-host.icon-type.auto" />
										</SelectItem>
										<SelectItem value={ICON_TYPE.CUSTOM}>
											<T id="proxy-host.icon-type.custom" />
										</SelectItem>
										<SelectItem value={ICON_TYPE.NONE}>
											<T id="proxy-host.icon-type.none" />
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						)}
					</Field>
				</div>
				<Field name="iconType">
					{({ field: typeField }: FieldProps) =>
						typeField.value === ICON_TYPE.CUSTOM && (
							<div className="col-span-12 md:col-span-8">
								<Field name="iconUrl">
									{({ field }: FieldProps) => (
										<div className="space-y-2">
											<Label htmlFor="iconUrl">
												<T id="proxy-host.icon-url" />
											</Label>
											<Input id="iconUrl" placeholder="https://example.com/icon.png" {...field} />
											<p className="text-xs text-muted-foreground">
												<T id="proxy-host.icon-url.hint" />
											</p>
										</div>
									)}
								</Field>
							</div>
						)
					}
				</Field>
			</div>
			<Field name="forwardPort">
				{({ field: portField }: FieldProps<number | undefined, ProxyHostFormValues>) => (
					<Field name="forwardHost">
						{({ field: hostField }: FieldProps<string, ProxyHostFormValues>) => (
							<Field name="iconType">
								{({ field: typeField }: FieldProps) => (
									<Field name="iconUrl">
										{({ field: urlField }: FieldProps) => (
											<div className="mt-4 flex items-center gap-4">
												<span className="text-sm text-muted-foreground">
													<T id="proxy-host.icon-preview" />:
												</span>
												<ServiceIcon
													port={portField.value}
													hostname={hostField.value}
													customIconUrl={urlField.value}
													iconType={typeField.value || ICON_TYPE.AUTO}
													size={40}
													showTooltip
												/>
											</div>
										)}
									</Field>
								)}
							</Field>
						)}
					</Field>
				)}
			</Field>
		</CardContent>
	</Card>
);

export default ProxyHostIconSettings;
