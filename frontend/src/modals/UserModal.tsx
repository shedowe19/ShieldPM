import { IconId, IconMail, IconPower, IconSettings, IconShield, IconUser } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { useState } from "react";
import { Loading } from "src/components";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Loader2 } from "lucide-react";
import { useSetUser, useUser } from "src/hooks";
import { intl, T } from "src/locale";
import { validateEmail, validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import { AlertCircle } from "lucide-react";

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

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const { ...payload } = {
			id: id === "new" ? undefined : id,
			roles: [],
			...values,
		};

		if (data?.id === currentUser?.id) {
			// Prevent user from locking themselves out
			delete payload.isDisabled;
			delete payload.roles;
		} else if (payload.isAdmin) {
			payload.roles = ["admin"];
		}

		// this isn't a real field, just for the form
		delete payload.isAdmin;

		setUser(payload, {
			onError: (err: any) => setErrorMsg(err.message),
			onSuccess: () => {
				showObjectSuccess("user", "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="max-w-lg">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconUser className="h-5 w-5" />
						<T id={data?.id ? "object.edit" : "object.add"} tData={{ object: "user" }} />
					</DialogTitle>
				</DialogHeader>

				{!isLoading && error && (
					<Alert variant="destructive" className="mb-4">
						<AlertCircle className="h-4 w-4" />
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{error?.message || "Unknown error"}</AlertDescription>
					</Alert>
				)}

				{(isLoading || currentIsLoading) && (
					<div className="flex justify-center p-8">
						<Loading noLogo />
					</div>
				)}

				{!isLoading && !currentIsLoading && data && currentUser && (
					<Formik
						initialValues={
							{
								name: data?.name,
								nickname: data?.nickname,
								email: data?.email,
								isAdmin: data?.roles?.includes("admin") || false,
								isDisabled: data?.isDisabled || false,
							} as any
						}
						onSubmit={onSubmit}
					>
						{({ errors, touched, setFieldValue, values }) => (
							<Form className="space-y-4">
								{errorMsg && (
									<Alert variant="destructive" className="mb-4">
										<AlertCircle className="h-4 w-4" />
										<AlertTitle>Error</AlertTitle>
										<AlertDescription>{errorMsg}</AlertDescription>
									</Alert>
								)}

								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="name" className="flex items-center gap-2">
											<IconUser className="h-4 w-4 text-muted-foreground" />
											<T id="user.full-name" />
										</Label>
										<Field name="name" validate={validateString(1, 50)}>
											{({ field }: any) => (
												<Input
													id="name"
													placeholder={intl.formatMessage({ id: "user.full-name" })}
													className={errors.name && touched.name ? "border-destructive" : ""}
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
											{({ field }: any) => (
												<Input
													id="nickname"
													placeholder={intl.formatMessage({ id: "user.nickname" })}
													className={
														errors.nickname && touched.nickname ? "border-destructive" : ""
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
										{({ field }: any) => (
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
													onCheckedChange={(checked) => setFieldValue("isAdmin", checked)}
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
													onCheckedChange={(checked) => setFieldValue("isDisabled", checked)}
												/>
											</div>
										</CardContent>
									</Card>
								)}

								<DialogFooter className="mt-6">
									<Button variant="outline" onClick={remove} disabled={isSubmitting} type="button">
										<T id="cancel" />
									</Button>
									<Button
										type="submit"
										variant="default"
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
