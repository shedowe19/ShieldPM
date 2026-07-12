import { IconLock, IconPhoto, IconShield, IconUser } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Form, Formik, type FormikHelpers } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { type User, uploadUserAvatar } from "src/api/backend";
import { Loading } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { useHealth, useSetUser, useUser } from "src/hooks";
import { useObjectUrl } from "src/hooks/useObjectUrl";
import { intl, T } from "src/locale";
import { showObjectSuccess } from "src/notifications";
import SecuritySettings from "src/pages/Profile/Security";
import { AUDIT_LOG_OBJECT_TYPE, AVATAR_TYPE, SHADCN_VARIANT, USER_ROLE } from "src/types/enums";
import UserAvatarTab from "./UserAvatarTab";
import UserDetailsTab, { type UserDetailsFormValues } from "./UserDetailsTab";

const showUserModal = (id: number | "me" | "new") => {
	EasyModal.show(UserModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "me" | "new";
}
const UserModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useUser(id);
	const { data: currentUser, isLoading: currentIsLoading } = useUser("me");
	const { mutate: setUser } = useSetUser();
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const selectedFileUrl = useObjectUrl(selectedFile);

	const onSubmit = async (values: UserDetailsFormValues, { setSubmitting }: FormikHelpers<UserDetailsFormValues>) => {
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
					<Formik<UserDetailsFormValues>
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
						{() => (
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

									<UserDetailsTab canManageUser={currentUser.id !== data.id} />

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
