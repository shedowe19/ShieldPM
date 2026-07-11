import { Field, type FieldProps, useFormikContext } from "formik";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { TabsContent } from "src/components/ui/tabs";
import { Textarea } from "src/components/ui/textarea";
import { intl, T } from "src/locale";
import { ACCESS_LIST_TAB } from "src/types/enums";

type AccessListMtlsFormValues = {
	mtlsContent?: string;
	mtlsEnabled?: boolean;
	mtlsUseInternal?: boolean;
};

const AccessListMtlsTab = () => {
	const { values, setFieldValue } = useFormikContext<AccessListMtlsFormValues>();

	return (
		<TabsContent value={ACCESS_LIST_TAB.MTLS} className="pt-4 space-y-4">
			<div className="flex items-center justify-between">
				<div className="space-y-0.5">
					<Label htmlFor="mtlsEnabled" className="text-base">
						<T id="access-list.mtls.enable" />
					</Label>
					<p className="text-sm text-muted-foreground">
						<T id="access-list.mtls.enable_desc" />
					</p>
				</div>
				<Field name="mtlsEnabled">
					{({ field }: FieldProps) => (
						<Switch
							id="mtlsEnabled"
							checked={field.value}
							onCheckedChange={(checked) => setFieldValue("mtlsEnabled", checked)}
						/>
					)}
				</Field>
			</div>

			<div className="flex items-center justify-between mt-4">
				<div className="space-y-0.5">
					<Label htmlFor="mtlsUseInternal" className="text-base">
						<T id="access-list.mtls.use_internal" />
					</Label>
					<p className="text-sm text-muted-foreground">
						<T id="access-list.mtls.use_internal_desc" />
					</p>
				</div>
				<Field name="mtlsUseInternal">
					{({ field }: FieldProps) => (
						<Switch
							id="mtlsUseInternal"
							checked={field.value}
							onCheckedChange={(checked) => setFieldValue("mtlsUseInternal", checked)}
						/>
					)}
				</Field>
			</div>

			{values.mtlsEnabled && !values.mtlsUseInternal && (
				<div className="space-y-2">
					<Label htmlFor="mtlsContent">
						<T id="access-list.mtls.certificate" />
					</Label>
					<Field name="mtlsContent">
						{({ field }: FieldProps) => (
							<Textarea
								{...field}
								id="mtlsContent"
								placeholder={intl.formatMessage({ id: "access-list.mtls.certificate.placeholder" })}
								className="font-mono text-xs h-64"
							/>
						)}
					</Field>
					<div className="text-sm text-muted-foreground">
						<T id="access-list.mtls.certificate_desc" />
					</div>
				</div>
			)}
		</TabsContent>
	);
};

export default AccessListMtlsTab;
