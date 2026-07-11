import { Field, type FieldProps } from "formik";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { T } from "src/locale";
import { validateOptionalNumber, validateString } from "src/modules/Validations";
import { FORWARD_SCHEME } from "src/types/enums";

const ProxyHostForwardingFields = () => (
	<>
		<div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
			<div className="md:col-span-3">
				<Field name="forwardScheme">
					{({ field, form }: FieldProps) => (
						<div className="space-y-2">
							<Label htmlFor="forwardScheme">
								<T id="host.forward-scheme" />
							</Label>
							<Select
								onValueChange={(value: string) => form.setFieldValue(field.name, value)}
								value={field.value}
							>
								<SelectTrigger
									id="forwardScheme"
									className={
										form.errors.forwardScheme && form.touched.forwardScheme
											? "border-destructive"
											: ""
									}
								>
									<SelectValue placeholder="http" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={FORWARD_SCHEME.HTTP}>http</SelectItem>
									<SelectItem value={FORWARD_SCHEME.HTTPS}>https</SelectItem>
									<SelectItem value={FORWARD_SCHEME.PATH}>path</SelectItem>
									<SelectItem value={FORWARD_SCHEME.GRPC}>grpc</SelectItem>
									<SelectItem value={FORWARD_SCHEME.GRPCS}>grpcs</SelectItem>
									<SelectItem value={FORWARD_SCHEME.TERMINAL}>terminal</SelectItem>
								</SelectContent>
							</Select>
							{form.errors.forwardScheme && form.touched.forwardScheme && (
								<p className="text-sm font-medium text-destructive">
									{form.errors.forwardScheme as string}
								</p>
							)}
						</div>
					)}
				</Field>
			</div>
			<div className="md:col-span-6">
				<Field name="forwardHost" validate={validateString(1, 255)}>
					{({ field, form }: FieldProps) => (
						<div className="space-y-2">
							<Label htmlFor="forwardHost">
								<T id="proxy-host.forward-host" />
							</Label>
							<Input
								id="forwardHost"
								placeholder="example.com"
								autoComplete="off"
								className={
									form.errors.forwardHost && form.touched.forwardHost ? "border-destructive" : ""
								}
								{...field}
							/>
							{form.errors.forwardHost && form.touched.forwardHost && (
								<p className="text-sm font-medium text-destructive">
									{form.errors.forwardHost as string}
								</p>
							)}
						</div>
					)}
				</Field>
			</div>
			<div className="md:col-span-3">
				<Field name="forwardPort" validate={validateOptionalNumber(1, 65535)}>
					{({ field, form }: FieldProps) => (
						<div className="space-y-2">
							<Label htmlFor="forwardPort">
								<T id="host.forward-port" />
							</Label>
							<Input
								id="forwardPort"
								type="number"
								min={1}
								max={65535}
								placeholder="eg: 8081"
								className={
									form.errors.forwardPort && form.touched.forwardPort ? "border-destructive" : ""
								}
								{...field}
							/>
							{form.errors.forwardPort && form.touched.forwardPort && (
								<p className="text-sm font-medium text-destructive">
									{form.errors.forwardPort as string}
								</p>
							)}
						</div>
					)}
				</Field>
			</div>
		</div>

		<Field name="forwardScheme">
			{({ field: schemeField }: FieldProps) =>
				schemeField.value === FORWARD_SCHEME.PATH && (
					<div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
						<div className="md:col-span-12">
							<Field name="indexFile">
								{({ field }: FieldProps) => (
									<div className="space-y-2">
										<Label htmlFor="indexFile">
											<T id="proxy-host.index-file" />
										</Label>
										<Input id="indexFile" placeholder="index.php" autoComplete="off" {...field} />
										<p className="text-xs text-muted-foreground">
											<T id="proxy-host.index-file.hint" />
										</p>
									</div>
								)}
							</Field>
						</div>
					</div>
				)
			}
		</Field>
	</>
);

export default ProxyHostForwardingFields;
