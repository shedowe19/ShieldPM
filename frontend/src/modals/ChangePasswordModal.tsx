import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { updateAuth } from "src/api/backend";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { AlertCircle, Loader2 } from "lucide-react";
import { IconDice, IconEye, IconEyeOff, IconLock } from "@tabler/icons-react";
import { generate } from "generate-password-browser";

const showChangePasswordModal = (id: number | "me") => {
	EasyModal.show(ChangePasswordModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "me";
}
const ChangePasswordModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const [error, setError] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showCurrent, setShowCurrent] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (values.new !== values.confirm) {
			setError(<T id="error.passwords-must-match" />);
			setSubmitting(false);
			return;
		}

		if (isSubmitting) return;
		setIsSubmitting(true);
		setError(null);

		try {
			await updateAuth(id, values.new, values.current);
			remove();
		} catch (err: any) {
			setError(<T id={err.message} />);
		}
		setIsSubmitting(false);
		setSubmitting(false);
	};

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center">
						<IconLock className="mr-2 h-5 w-5" />
						<T id="user.change-password" />
					</DialogTitle>
				</DialogHeader>

				<Formik
					initialValues={
						{
							current: "",
							new: "",
							confirm: "",
						} as any
					}
					onSubmit={onSubmit}
				>
					{({ errors, touched, setFieldValue }) => (
						<Form className="space-y-4">
							{error && (
								<Alert variant="destructive" className="mb-4">
									<AlertCircle className="h-4 w-4" />
									<AlertTitle>Error</AlertTitle>
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							<div className="space-y-2">
								<Label htmlFor="current">
									<T id="user.current-password" />
								</Label>
								<Field name="current">
									{({ field }: any) => (
										<div className="relative">
											<Input
												id="current"
												type={showCurrent ? "text" : "password"}
												autoComplete="current-password"
												required
												placeholder={intl.formatMessage({
													id: "user.current-password",
												})}
												className={
													errors.current && touched.current
														? "border-destructive pr-10"
														: "pr-10"
												}
												{...field}
											/>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
												onClick={() => setShowCurrent(!showCurrent)}
												tabIndex={-1}
											>
												{showCurrent ? <IconEyeOff size={16} /> : <IconEye size={16} />}
											</Button>
										</div>
									)}
								</Field>
								{errors.current && touched.current && (
									<p className="text-sm font-medium text-destructive">{errors.current as string}</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="new">
									<T id="user.new-password" />
								</Label>
								<Field name="new" validate={validateString(8, 100)}>
									{({ field }: any) => (
										<div className="flex gap-2">
											<div className="relative flex-1">
												<Input
													id="new"
													type={showNew ? "text" : "password"}
													autoComplete="new-password"
													required
													placeholder={intl.formatMessage({ id: "user.new-password" })}
													className={
														errors.new && touched.new ? "border-destructive pr-10" : "pr-10"
													}
													{...field}
												/>
												<Button
													type="button"
													variant="ghost"
													size="icon"
													className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
													onClick={() => setShowNew(!showNew)}
													tabIndex={-1}
												>
													{showNew ? <IconEyeOff size={16} /> : <IconEye size={16} />}
												</Button>
											</div>
											<Button
												type="button"
												variant="outline"
												size="icon"
												title={intl.formatMessage({ id: "password.generate" })}
												onClick={() => {
													const newPass = generate({
														length: 16,
														numbers: true,
														symbols: true,
														strict: true,
													});
													setFieldValue(field.name, newPass);
													setFieldValue("confirm", newPass);
													setShowNew(true);
													setShowConfirm(true);
												}}
											>
												<IconDice size={16} />
											</Button>
										</div>
									)}
								</Field>
								{errors.new && touched.new && (
									<p className="text-sm font-medium text-destructive">{errors.new as string}</p>
								)}
							</div>

							<div className="space-y-2">
								<Label htmlFor="confirm">
									<T id="user.confirm-password" />
								</Label>
								<Field name="confirm" validate={validateString(8, 100)}>
									{({ field }: any) => (
										<div className="relative">
											<Input
												id="confirm"
												type={showConfirm ? "text" : "password"}
												autoComplete="new-password"
												required
												placeholder={intl.formatMessage({ id: "user.confirm-password" })}
												className={
													errors.confirm && touched.confirm
														? "border-destructive pr-10"
														: "pr-10"
												}
												{...field}
											/>
											<Button
												type="button"
												variant="ghost"
												size="icon"
												className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
												onClick={() => setShowConfirm(!showConfirm)}
												tabIndex={-1}
											>
												{showConfirm ? <IconEyeOff size={16} /> : <IconEye size={16} />}
											</Button>
										</div>
									)}
								</Field>
								{errors.confirm && touched.confirm && (
									<p className="text-sm font-medium text-destructive">{errors.confirm as string}</p>
								)}
							</div>

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
			</DialogContent>
		</Dialog>
	);
});

export { showChangePasswordModal };
