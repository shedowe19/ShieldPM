import { Field, type FieldProps, useFormikContext } from "formik";
import { Card, CardContent } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { TabsContent } from "src/components/ui/tabs";
import { T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { ACCESS_LIST_TAB } from "src/types/enums";

type AccessListDetailsFormValues = {
	name?: string;
	passAuth?: boolean;
	satisfyAny?: boolean;
};

const AccessListDetailsTab = () => {
	const { errors, setFieldValue, touched } = useFormikContext<AccessListDetailsFormValues>();

	return (
		<TabsContent value={ACCESS_LIST_TAB.DETAILS} className="space-y-4 pt-4">
			<div className="space-y-2">
				<Label htmlFor="name">
					<T id="column.name" />
				</Label>
				<Field name="name" validate={validateString(1, 255)}>
					{({ field }: FieldProps) => (
						<Input
							{...field}
							id="name"
							autoComplete="off"
							className={errors.name && touched.name ? "border-destructive" : ""}
						/>
					)}
				</Field>
				{errors.name && touched.name && <div className="text-sm text-destructive">{errors.name}</div>}
			</div>

			<Card className="border-dashed">
				<CardContent className="p-4 space-y-4">
					<h3 className="font-medium">
						<T id="options" />
					</h3>
					<div className="flex items-center justify-between">
						<Label htmlFor="satisfyAny" className="cursor-pointer">
							<T id="access-list.satisfy-any" />
						</Label>
						<Field name="satisfyAny">
							{({ field }: FieldProps) => (
								<Switch
									id="satisfyAny"
									checked={field.value}
									onCheckedChange={(checked) => setFieldValue("satisfyAny", checked)}
								/>
							)}
						</Field>
					</div>
					<div className="flex items-center justify-between">
						<Label htmlFor="passAuth" className="cursor-pointer">
							<T id="access-list.pass-auth" />
						</Label>
						<Field name="passAuth">
							{({ field }: FieldProps) => (
								<Switch
									id="passAuth"
									checked={field.value}
									onCheckedChange={(checked) => setFieldValue("passAuth", checked)}
								/>
							)}
						</Field>
					</div>
				</CardContent>
			</Card>
		</TabsContent>
	);
};

export default AccessListDetailsTab;
