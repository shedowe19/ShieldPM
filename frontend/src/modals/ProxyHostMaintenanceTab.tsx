import { IconTool } from "@tabler/icons-react";
import { Field, type FieldProps } from "formik";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { TabsContent } from "src/components/ui/tabs";
import { Textarea } from "src/components/ui/textarea";
import { intl, T } from "src/locale";
import { PROXY_HOST_TAB } from "src/types/enums";

const ProxyHostMaintenanceTab = () => (
	<TabsContent value={PROXY_HOST_TAB.MAINTENANCE} className="mt-0 space-y-4">
		<Alert variant="default" className="bg-muted/50">
			<IconTool className="h-4 w-4" />
			<AlertTitle>
				<T id="proxy-host.maintenance-mode" />
			</AlertTitle>
			<AlertDescription>
				<T id="proxy-host.maintenance.description" />
			</AlertDescription>
		</Alert>

		<div className="flex items-center justify-between p-4 border rounded-lg bg-card/50">
			<div className="space-y-0.5">
				<Label htmlFor="maintenanceActive" className="text-base">
					<T id="proxy-host.maintenance.active" />
				</Label>
				<p className="text-sm text-muted-foreground">
					<T id="proxy-host.maintenance.active.description" />
				</p>
			</div>
			<Field name="maintenanceActive" type="checkbox">
				{({ field, form }: FieldProps) => (
					<Switch
						id="maintenanceActive"
						checked={field.checked}
						onCheckedChange={(checked: boolean) => form.setFieldValue("maintenanceActive", checked)}
					/>
				)}
			</Field>
		</div>

		<div className="grid grid-cols-2 gap-4">
			<Field name="maintenanceStart">
				{({ field }: FieldProps) => (
					<div className="space-y-2">
						<Label htmlFor="maintenanceStart">
							<T id="proxy-host.maintenance.start" />
						</Label>
						<Input id="maintenanceStart" type="datetime-local" step="1" {...field} />
					</div>
				)}
			</Field>

			<Field name="maintenanceEnd">
				{({ field }: FieldProps) => (
					<div className="space-y-2">
						<Label htmlFor="maintenanceEnd">
							<T id="proxy-host.maintenance.end" />
						</Label>
						<Input id="maintenanceEnd" type="datetime-local" step="1" {...field} />
					</div>
				)}
			</Field>
		</div>

		<Field name="maintenanceReason">
			{({ field }: FieldProps) => (
				<div className="space-y-2">
					<Label htmlFor="maintenanceReason">
						<T id="proxy-host.maintenance.reason" />
					</Label>
					<Textarea
						id="maintenanceReason"
						placeholder={intl.formatMessage({ id: "proxy-host.maintenance.reason.placeholder" })}
						className="min-h-[100px]"
						{...field}
					/>
				</div>
			)}
		</Field>
	</TabsContent>
);

export default ProxyHostMaintenanceTab;
