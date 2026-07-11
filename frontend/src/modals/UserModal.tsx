import {
	IconId,
	IconLock,
	IconMail,
	IconPhoto,
	IconPower,
	IconSettings,
	IconShield,
	IconUser,
} from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { type User, uploadUserAvatar } from "src/api/backend";
import { Loading, UserAvatar } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "src/components/ui/toggle-group";
import { useHealth, useSetUser, useUser } from "src/hooks";
import { useObjectUrl } from "src/hooks/useObjectUrl";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import SecuritySettings from "src/pages/Profile/Security";
import { AUDIT_LOG_OBJECT_TYPE, AVATAR_TYPE, type AvatarType, SHADCN_VARIANT, USER_ROLE } from "src/types/enums";

const showUserModal = (id: number | "me" | "new") => {
	EasyModal.show(UserModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "me" | "new";
}
interface UserValues {
	name: string;
	nickname: string;
	email: string;
	isAdmin: boolean;
	isDisabled: boolean;
	avatar_type: AvatarType;
	avatar_value: string;
}

const UserModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useUser(id);
	const { data: currentUser, isLoading: currentIsLoading } = useUser("me");
	const { mutate: setUser } = useSetUser();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const selectedFileUrl = useObjectUrl(selectedFile);

	const onSubmit = async (values: UserValues, { setSubmitting }: FormikHelpers<UserValues>) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload: Record<string, unknown> = {
			id: id === "new" ? undefined : (id as number),
			roles: [],
			...values,
			is_disabled: values.isDisabled,
		};

		if (data?.id === currentUser?.id) {
			// Prevent user from locking themselves out
			delete payload.is_disabled;
			delete payload.roles;
		} else if (payload.isAdmin) {
			payload.roles = [USER_ROLE.ADMIN];
		}

		// these aren't real fields, just for the form
		delete payload.isAdmin;
		delete payload.isDisabled;
		delete payload.avatar_type;
		delete payload.avatar_value;

		setUser(payload as unknown as User, {
			onError: (err) => {
				if (err instanceof Error) setErrorMsg(err.message);
				setIsSubmitting(false);
				setSubmitting(false);
			},
			onSuccess: async (newUser) => {
				// Assuming hooks/useSetUser returns the user object on success
				if (values.avatar_type === AVATAR_TYPE.UPLOAD && selectedFile) {
					try {
						await uploadUserAvatar({ id: newUser.id, file: selectedFile });
					} catch (err) {
						setErrorMsg(err instanceof Error ? err.message : intl.formatMessage({ id: "error.unknown" }));
						setIsSubmitting(false);
						setSubmitting(false);
						return;
					}
				}

				showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.USER, "saved");
				remove();
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	const health = useHealth();
	const isSelf =
		id === "me" || (data?.id !== undefined && currentUser?.id !== undefined && data.id === currentUser.id);

	if (health.data?.demo) {
		return (
			<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
				<DialogContent className="max-w-lg border-red-500 border-2">
					<DialogHeader>
						<DialogTitle className="flex items-center gap-2 text-red-500">
							<IconShield className="h-5 w-5" />
							<T id="users.demo.access-denied" />
						</DialogTitle>
					</DialogHeader>
					<div className="p-8 text-center text-muted-foreground">
						<p className="text-lg font-semibold">
							<T id="users.demo.disabled" />
						</p>
					</div>
					<DialogFooter>
						<Button variant={SHADCN_VARIANT.OUTLINE} onClick={remove}>
							<T id="close" />
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconUser className="h-5 w-5" />
						<T
							id={data?.id ? "object.edit" : "object.add"}
							tData={{ object: AUDIT_LOG_OBJECT_TYPE.USER }}
						/>
					</DialogTitle>
				</DialogHeader>

				{!isLoading && error && (
					<Alert variant="destructive" className="mb-4">
						<AlertCircle className="h-4 w-4" />
						<AlertTitle>
							<T id="error.title" />
						</AlertTitle>
						<AlertDescription>{error?.message || <T id="error.unknown" />}</AlertDescription>
					</Alert>
				)}

				{(isLoading || currentIsLoading) && (
					<div className="flex justify-center p-8">
						<Loading noLogo />
					</div>
				)}

				{!isLoading && !currentIsLoading && data && currentUser && (
					<Formik<UserValues>
						initialValues={{
							name: data?.name || "",
							nickname: data?.nickname || "",
							email: data?.email || "",
							isAdmin: data?.roles?.includes(USER_ROLE.ADMIN) || false,
							isDisabled: data?.isDisabled || false,
							avatar_type: data?.avatar_type || AVATAR_TYPE.GRAVATAR,
							avatar_value: data?.avatar_value || "",
						}}
						onSubmit={onSubmit}
					>
						{({ errors, touched, setFieldValue, values }) => (
							<Form className="space-y-4">
								{errorMsg && (
									<Alert variant="destructive" className="mb-4">
										<AlertCircle className="h-4 w-4" />
										<AlertTitle>
											<T id="error.title" />
										</AlertTitle>
										<AlertDescription>{errorMsg}</AlertDescription>
									</Alert>
								)}

								<Tabs defaultValue="details" className="w-full">
									<TabsList className={`grid w-full mb-4 ${isSelf ? "grid-cols-3" : "grid-cols-2"}`}>
										<TabsTrigger value="details" className="flex items-center gap-2">
											<IconUser className="h-4 w-4" />
											<span className="hidden sm:inline">
												<T id="details" />
											</span>
										</TabsTrigger>
										<TabsTrigger value="avatar" className="flex items-center gap-2">
											<IconPhoto className="h-4 w-4" />
											<span className="hidden sm:inline">
												<T id="user.avatar" />
											</span>
										</TabsTrigger>
										{isSelf && (
											<TabsTrigger value="security" className="flex items-center gap-2">
												<IconLock className="h-4 w-4" />
												<span className="hidden sm:inline">
													<T id="user.security" />
												</span>
											</TabsTrigger>
										)}
									</TabsList>

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
															className={
																errors.name && touched.name ? "border-destructive" : ""
															}
															{...field}
														/>
													)}
												</Field>
												{errors.name && touched.name && (
													<p className="text-sm font-medium text-destructive">
														{errors.name as string}
													</p>
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
															className={
																errors.nickname && touched.nickname
																	? "border-destructive"
																	: ""
															}
															{...field}
														/>
													)}
												</Field>
												{errors.nickname && touched.nickname && (
													<p className="text-sm font-medium text-destructive">
														{errors.nickname as string}
													</p>
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
														className={
															errors.email && touched.email ? "border-destructive" : ""
														}
														{...field}
													/>
												)}
											</Field>
											{errors.email && touched.email && (
												<p className="text-sm font-medium text-destructive">
													{errors.email as string}
												</p>
											)}
										</div>

										{currentUser && data && currentUser?.id !== data?.id && (
											<Card className="mt-6 border-dashed">
												<CardContent className="p-4 space-y-4">
													<h4 className="text-sm font-medium flex items-center gap-2">
														<IconSettings className="h-4 w-4" />
														<T id="options" />
													</h4>
													<div className="flex items-center justify-between">
														<Label
															htmlFor="isAdmin"
															className="flex-1 cursor-pointer flex items-center gap-2"
														>
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
															onCheckedChange={(checked) =>
																setFieldValue("isAdmin", checked)
															}
														/>
													</div>
													<div className="flex items-center justify-between">
														<Label
															htmlFor="isDisabled"
															className="flex-1 cursor-pointer flex items-center gap-2"
														>
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
															onCheckedChange={(checked) =>
																setFieldValue("isDisabled", checked)
															}
														/>
													</div>
												</CardContent>
											</Card>
										)}
									</TabsContent>

									<TabsContent
										value="avatar"
										className="space-y-6 animate-in fade-in slide-in-from-bottom-2"
									>
										<div className="flex flex-col items-center justify-center p-6 border rounded-lg bg-muted/20">
											<div className="bg-background rounded-full p-1 shadow-sm border mb-4">
												{/* Preview Logic */}
												<UserAvatar
													className="h-24 w-24"
													name={values.name || intl.formatMessage({ id: "user" })}
													url={
														values.avatar_type === "upload" && selectedFile
															? selectedFileUrl
															: values.avatar_type === "url"
																? values.avatar_value
																: values.avatar_type === "upload" && !selectedFile
																	? data?.avatar // Shows current upload if exists
																	: undefined // Gravatar (UserAvatar handles undefined url)
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
												onValueChange={(val) => {
													if (val) setFieldValue("avatar_type", val);
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
															placeholder={intl.formatMessage({
																id: "user.avatar.image-url-placeholder",
															})}
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
														className="hidden"
														accept="image/png, image/jpeg, image/gif, image/webp"
														onChange={(event) => {
															const file = event.currentTarget.files?.[0];
															setSelectedFile(file || null);
														}}
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

									{isSelf && (
										<TabsContent
											value="security"
											className="space-y-4 animate-in fade-in slide-in-from-bottom-2"
										>
											<SecuritySettings />
										</TabsContent>
									)}
								</Tabs>

								<DialogFooter className="mt-6">
									<Button
										variant={SHADCN_VARIANT.OUTLINE}
										onClick={remove}
										disabled={isSubmitting}
										type="button"
									>
										<T id="cancel" />
									</Button>
									<Button
										type="submit"
										variant={SHADCN_VARIANT.DEFAULT}
										disabled={isSubmitting}
										className="bg-orange-600/90 hover:bg-orange-600 text-white shadow-sm"
									>
										{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
										<T id="save" />
									</Button>
								</DialogFooter>
							</Form>
						)}
					</Formik>
				)}
			</DialogContent>
		</Dialog>
	);
});

export { showUserModal };
