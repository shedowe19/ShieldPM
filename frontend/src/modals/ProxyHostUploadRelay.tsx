import { Field, type FieldProps } from "formik";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { T } from "src/locale";

const NumericField = ({ id, max, min }: { id: string; max: number; min: number }) => (
	<Field name={id}>
		{({ field, form }: FieldProps) => (
			<div className="space-y-2">
				<Label htmlFor={id}>
					<T
						id={`proxy-host.upload-relay.${id
							.replace("uploadRelay", "")
							.replace(/([A-Z])/g, "-$1")
							.toLowerCase()
							.slice(1)}`}
					/>
				</Label>
				<Input
					id={id}
					max={max}
					min={min}
					onChange={(event) => form.setFieldValue(id, Number(event.target.value))}
					type="number"
					value={field.value}
				/>
			</div>
		)}
	</Field>
);

const TextField = ({ id }: { id: string }) => (
	<Field name={id}>
		{({ field }: FieldProps) => (
			<div className="space-y-2">
				<Label htmlFor={id}>
					<T
						id={`proxy-host.upload-relay.${id
							.replace("uploadRelay", "")
							.replace(/([A-Z])/g, "-$1")
							.toLowerCase()
							.slice(1)}`}
					/>
				</Label>
				<Input id={id} {...field} />
			</div>
		)}
	</Field>
);

const ProxyHostUploadRelay = () => (
	<div className="space-y-4 rounded-lg border p-4">
		<Alert variant="default" className="bg-muted/50">
			<AlertTitle>
				<T id="proxy-host.upload-relay.title" />
			</AlertTitle>
			<AlertDescription>
				<T id="proxy-host.upload-relay.description" />
			</AlertDescription>
		</Alert>
		<Field name="uploadRelayEnabled" type="checkbox">
			{({ field, form }: FieldProps) => (
				<div className="flex items-center justify-between">
					<Label htmlFor="uploadRelayEnabled" className="cursor-pointer">
						<T id="proxy-host.upload-relay.enabled" />
					</Label>
					<Switch
						checked={field.checked}
						id="uploadRelayEnabled"
						onCheckedChange={(checked: boolean) => form.setFieldValue("uploadRelayEnabled", checked)}
					/>
				</div>
			)}
		</Field>
		<Field name="uploadRelayEnabled">
			{({ field }: FieldProps) =>
				field.value && (
					<div className="grid gap-4 md:grid-cols-2">
						<TextField id="uploadRelayPath" />
						<TextField id="uploadRelayTargetPath" />
						<NumericField id="uploadRelayChunkSize" max={90 * 1024 * 1024} min={5 * 1024 * 1024} />
						<NumericField id="uploadRelayMaxFileSize" max={Number.MAX_SAFE_INTEGER} min={5 * 1024 * 1024} />
						<NumericField
							id="uploadRelayMaxPendingBytes"
							max={Number.MAX_SAFE_INTEGER}
							min={5 * 1024 * 1024}
						/>
						<NumericField id="uploadRelayCleanupHours" max={720} min={1} />
					</div>
				)
			}
		</Field>
	</div>
);

export default ProxyHostUploadRelay;
