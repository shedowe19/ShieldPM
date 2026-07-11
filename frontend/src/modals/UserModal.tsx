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
import { Loading } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { useHealth, useSetUser, useUser } from "src/hooks";
import { useObjectUrl } from "src/hooks/useObjectUrl";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import SecuritySettings from "src/pages/Profile/Security";
import { AUDIT_LOG_OBJECT_TYPE, AVATAR_TYPE, type AvatarType, SHADCN_VARIANT, USER_ROLE } from "src/types/enums";
import UserAvatarTab from "./UserAvatarTab";

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

									<UserAvatarTab
										avatar={data?.avatar}
										onSelectedFileChange={setSelectedFile}
										selectedFile={selectedFile}
										selectedFileUrl={selectedFileUrl}
									/>

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
