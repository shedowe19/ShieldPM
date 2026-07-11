import { Field, type FieldProps } from "formik";
import { Card, CardContent } from "src/components/ui/card";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { T } from "src/locale";

const ProxyHostOptions = () => (
	<Card className="my-3 border-dashed">
		<CardContent className="p-4">
			<h4 className="pb-2 text-lg font-semibold">
				<T id="options" />
			</h4>
			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<Label htmlFor="cachingEnabled" className="flex-1 cursor-pointer">
						<T id="host.flags.cache-assets" />
					</Label>
					<Field name="cachingEnabled" type="checkbox">
						{({ field, form }: FieldProps) => (
							<Switch
								id="cachingEnabled"
								checked={field.checked}
								onCheckedChange={(checked: boolean) => form.setFieldValue("cachingEnabled", checked)}
							/>
						)}
					</Field>
				</div>
				<div className="flex items-center justify-between">
					<Label htmlFor="disableBuffering" className="flex-1 cursor-pointer">
						<T id="disableBuffering" />
					</Label>
					<Field name="disableBuffering" type="checkbox">
						{({ field, form }: FieldProps) => (
							<Switch
								id="disableBuffering"
								checked={field.checked}
								onCheckedChange={(checked: boolean) => form.setFieldValue("disableBuffering", checked)}
							/>
						)}
					</Field>
				</div>
				<div className="flex items-center justify-between">
					<Label htmlFor="blockExploits" className="flex-1 cursor-pointer">
						<T id="host.flags.block-exploits" />
					</Label>
					<Field name="blockExploits" type="checkbox">
						{({ field, form }: FieldProps) => (
							<Switch
								id="blockExploits"
								checked={field.checked}
								onCheckedChange={(checked: boolean) => form.setFieldValue("blockExploits", checked)}
							/>
						)}
					</Field>
				</div>
				<div className="flex items-center justify-between">
					<Label htmlFor="allowWebsocketUpgrade" className="flex-1 cursor-pointer">
						<T id="host.flags.websockets-upgrade" />
					</Label>
					<Field name="allowWebsocketUpgrade" type="checkbox">
						{({ field, form }: FieldProps) => (
							<Switch
								id="allowWebsocketUpgrade"
								checked={field.checked}
								onCheckedChange={(checked: boolean) =>
									form.setFieldValue("allowWebsocketUpgrade", checked)
								}
							/>
						)}
					</Field>
				</div>
				<div className="flex items-center justify-between">
					<Label htmlFor="maintenanceOnFailure" className="flex-1 cursor-pointer">
						<T id="host.flags.maintenance-on-failure" />
					</Label>
					<Field name="maintenanceOnFailure" type="checkbox">
						{({ field, form }: FieldProps) => (
							<Switch
								id="maintenanceOnFailure"
								checked={field.checked}
								onCheckedChange={(checked: boolean) =>
									form.setFieldValue("maintenanceOnFailure", checked)
								}
							/>
						)}
					</Field>
				</div>
			</div>
		</CardContent>
	</Card>
);

export default ProxyHostOptions;
