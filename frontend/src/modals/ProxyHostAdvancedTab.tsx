import { IconBolt } from "@tabler/icons-react";
import { Field, type FieldProps } from "formik";
import { NginxConfigField } from "src/components/Form/NginxConfigField";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { TabsContent } from "src/components/ui/tabs";
import { T } from "src/locale";
import { PROXY_HOST_TAB } from "src/types/enums";

const ProxyHostAdvancedTab = () => (
	<TabsContent value={PROXY_HOST_TAB.ADVANCED} className="mt-0 space-y-4">
		<Alert variant="default" className="bg-muted/50 mt-4">
			<IconBolt className="h-4 w-4 text-emerald-500" />
			<AlertTitle>
				<T id="proxy-host.turbo-loader.title" />
			</AlertTitle>
			<AlertDescription>
				<T id="proxy-host.turbo-loader.description" />
			</AlertDescription>
		</Alert>

		<div className="flex items-center justify-between p-4 border rounded-lg bg-card/50">
			<div className="space-y-0.5">
				<Label htmlFor="turboLoader" className="text-base cursor-pointer">
					<T id="proxy-host.turbo-loader.multi-part" />
				</Label>
				<p className="text-sm text-muted-foreground">
					<T id="proxy-host.turbo-loader.multi-part.description" />
				</p>
			</div>
			<Field name="turboLoader" type="checkbox">
				{({ field, form }: FieldProps) => (
					<Switch
						id="turboLoader"
						checked={field.checked}
						onCheckedChange={(checked: boolean) => form.setFieldValue("turboLoader", checked)}
					/>
				)}
			</Field>
		</div>

		<NginxConfigField />
	</TabsContent>
);

export default ProxyHostAdvancedTab;
