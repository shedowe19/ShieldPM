import { IconMail } from "@tabler/icons-react";
import { Field, type FieldProps, useFormikContext } from "formik";
import { UserAvatar } from "src/components";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { TabsContent } from "src/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "src/components/ui/toggle-group";
import { intl, T } from "src/locale";
import type { AvatarType } from "src/types/enums";

type UserAvatarFormValues = {
	avatar_type: AvatarType;
	avatar_value: string;
	email: string;
	name: string;
};

interface UserAvatarTabProps {
	avatar?: string;
	onSelectedFileChange: (file: File | null) => void;
	selectedFile: File | null;
	selectedFileUrl?: string;
}

const UserAvatarTab = ({ avatar, onSelectedFileChange, selectedFile, selectedFileUrl }: UserAvatarTabProps) => {
	const { errors, setFieldValue, values } = useFormikContext<UserAvatarFormValues>();

	return (
		<TabsContent value="avatar" className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
			<div className="flex flex-col items-center justify-center p-6 border rounded-lg bg-muted/20">
				<div className="bg-background rounded-full p-1 shadow-sm border mb-4">
					<UserAvatar
						className="h-24 w-24"
						name={values.name || intl.formatMessage({ id: "user" })}
						url={
							values.avatar_type === "upload" && selectedFile
								? selectedFileUrl
								: values.avatar_type === "url"
									? values.avatar_value
									: values.avatar_type === "upload" && !selectedFile
										? avatar
										: undefined
						}
					/>
				</div>
				<p className="text-sm text-muted-foreground text-center max-w-xs">
					<T id="user.avatar.profile-preview" />
				</p>
			</div>

			<div className="space-y-4">
				<Label>
					<T id="user.avatar.source" />
				</Label>
				<ToggleGroup
					type="single"
					value={values.avatar_type}
					onValueChange={(value) => {
						if (value) setFieldValue("avatar_type", value);
					}}
					className="justify-start border p-1 rounded-md inline-flex"
				>
					<ToggleGroupItem
						value="gravatar"
						aria-label={intl.formatMessage({ id: "user.avatar.gravatar" })}
						className="gap-2"
					>
						<T id="user.avatar.gravatar" />
					</ToggleGroupItem>
					<ToggleGroupItem
						value="url"
						aria-label={intl.formatMessage({ id: "user.avatar.url" })}
						className="gap-2"
					>
						<T id="user.avatar.url" />
					</ToggleGroupItem>
					<ToggleGroupItem
						value="upload"
						aria-label={intl.formatMessage({ id: "user.avatar.upload" })}
						className="gap-2"
					>
						<T id="user.avatar.upload" />
					</ToggleGroupItem>
				</ToggleGroup>
			</div>

			{values.avatar_type === "gravatar" && (
				<div className="text-sm text-muted-foreground bg-blue-500/10 text-blue-600 p-3 rounded-md flex items-start gap-2">
					<IconMail className="h-5 w-5 shrink-0" />
					<span>
						<T id="user.avatar.gravatar-description" />
						<br />
						<strong>{values.email}</strong>
					</span>
				</div>
			)}

			{values.avatar_type === "url" && (
				<div className="space-y-2">
					<Label htmlFor="avatar_value">
						<T id="user.avatar.image-url" />
					</Label>
					<Field name="avatar_value">
						{({ field }: FieldProps) => (
							<Input
								{...field}
								id="avatar_value"
								placeholder={intl.formatMessage({ id: "user.avatar.image-url-placeholder" })}
								className={errors.avatar_value ? "border-destructive" : ""}
							/>
						)}
					</Field>
					<p className="text-xs text-muted-foreground">
						<T id="user.avatar.image-url-help" />
					</p>
				</div>
			)}

			{values.avatar_type === "upload" && (
				<div className="space-y-2">
					<Label htmlFor="file_upload">
						<T id="user.avatar.upload-image" />
					</Label>
					<div className="relative">
						<Input
							id="file_upload"
							type="file"
							className="sr-only"
							accept="image/png, image/jpeg, image/gif, image/webp"
							onChange={(event) => onSelectedFileChange(event.currentTarget.files?.[0] || null)}
						/>
						<label
							htmlFor="file_upload"
							className="cursor-pointer inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
						>
							<T id="user.avatar.choose-file" />
						</label>
					</div>
					<p className="text-xs text-muted-foreground">
						<T id="user.avatar.upload-requirements" />
					</p>
				</div>
			)}
		</TabsContent>
	);
};

export default UserAvatarTab;
