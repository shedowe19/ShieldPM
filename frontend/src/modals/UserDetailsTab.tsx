import { IconId, IconMail, IconPower, IconSettings, IconShield, IconUser } from "@tabler/icons-react";
import { Field, type FieldProps, useFormikContext } from "formik";
import { Card, CardContent } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { TabsContent } from "src/components/ui/tabs";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import type { AvatarType } from "src/types/enums";

export interface UserDetailsFormValues {
	name: string;
	nickname: string;
	email: string;
	isAdmin: boolean;
	isDisabled: boolean;
	avatar_type: AvatarType;
	avatar_value: string;
}

interface Props {
	canManageUser: boolean;
}

const UserDetailsTab = ({ canManageUser }: Props) => {
	const { errors, setFieldValue, touched, values } = useFormikContext<UserDetailsFormValues>();

	return (
		<TabsContent value="details" className="space-y-4">
			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="space-y-2">
					<Label htmlFor="name" className="flex items-center gap-2">
						<IconUser className="h-4 w-4 text-muted-foreground" />
						<T id="user.full-name" />
					</Label>
					<Field name="name" validate={validateString(1, 50)}>
						{({ field }: FieldProps) => (
							<Input
								id="name"
								placeholder={intl.formatMessage({ id: "user.full-name" })}
								className={errors.name && touched.name ? "border-destructive" : ""}
								{...field}
							/>
						)}
					</Field>
					{errors.name && touched.name && (
						<p className="text-sm font-medium text-destructive">{errors.name as string}</p>
					)}
				</div>
				<div className="space-y-2">
					<Label htmlFor="nickname" className="flex items-center gap-2">
						<IconId className="h-4 w-4 text-muted-foreground" />
						<T id="user.nickname" />
					</Label>
					<Field name="nickname" validate={validateString(1, 30)}>
						{({ field }: FieldProps) => (
							<Input
								id="nickname"
								placeholder={intl.formatMessage({ id: "user.nickname" })}
								className={errors.nickname && touched.nickname ? "border-destructive" : ""}
								{...field}
							/>
						)}
					</Field>
					{errors.nickname && touched.nickname && (
						<p className="text-sm font-medium text-destructive">{errors.nickname as string}</p>
					)}
				</div>
			</div>

			<div className="space-y-2">
				<Label htmlFor="email" className="flex items-center gap-2">
					<IconMail className="h-4 w-4 text-muted-foreground" />
					<T id="email-address" />
				</Label>
				<Field name="email" validate={validateEmail()}>
					{({ field }: FieldProps) => (
						<Input
							id="email"
							type="email"
							placeholder={intl.formatMessage({ id: "email-address" })}
							className={errors.email && touched.email ? "border-destructive" : ""}
							{...field}
						/>
					)}
				</Field>
				{errors.email && touched.email && (
					<p className="text-sm font-medium text-destructive">{errors.email as string}</p>
				)}
			</div>

			{canManageUser && (
				<Card className="mt-6 border-dashed">
					<CardContent className="p-4 space-y-4">
						<h4 className="text-sm font-medium flex items-center gap-2">
							<IconSettings className="h-4 w-4" />
							<T id="options" />
						</h4>
						<div className="flex items-center justify-between">
							<Label htmlFor="isAdmin" className="flex-1 cursor-pointer flex items-center gap-2">
								<IconShield className="h-4 w-4 text-orange-500" />
								<div className="flex flex-col">
									<span>
										<T id="role.admin" />
									</span>
									<span className="text-xs text-muted-foreground font-normal">
										<T id="user.permissions.full-system-access" />
									</span>
								</div>
							</Label>
							<Switch
								id="isAdmin"
								checked={values.isAdmin}
								onCheckedChange={(checked) => setFieldValue("isAdmin", checked)}
							/>
						</div>
						<div className="flex items-center justify-between">
							<Label htmlFor="isDisabled" className="flex-1 cursor-pointer flex items-center gap-2">
								<IconPower className="h-4 w-4 text-red-500" />
								<div className="flex flex-col">
									<span>
										<T id="disabled" />
									</span>
									<span className="text-xs text-muted-foreground font-normal">
										<T id="user.permissions.prevent-login" />
									</span>
								</div>
							</Label>
							<Switch
								id="isDisabled"
								checked={values.isDisabled}
								onCheckedChange={(checked) => setFieldValue("isDisabled", checked)}
							/>
						</div>
					</CardContent>
				</Card>
			)}
		</TabsContent>
	);
};

export default UserDetailsTab;
