import { IconDice, IconEye, IconEyeOff, IconLock } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers } from "formik";
import { generate } from "generate-password-browser";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { updateAuth } from "src/api/backend";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { useHealth } from "src/hooks";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";

const showChangePasswordModal = (id: number | "me") => {
	EasyModal.show(ChangePasswordModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "me";
}
interface ChangePasswordValues {
	current: string;
	new: string;
	confirm: string;
}

const ChangePasswordModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const [error, setError] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showCurrent, setShowCurrent] = useState(false);
	const [showNew, setShowNew] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);

	const onSubmit = async (values: ChangePasswordValues, { setSubmitting }: FormikHelpers<ChangePasswordValues>) => {
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
		} catch (err) {
			if (err instanceof Error) setError(<T id={err.message} />);
		}
		setIsSubmitting(false);
		setSubmitting(false);
	};

	const health = useHealth();

	if (health.data?.demo) {
		return (
			<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
				<DialogContent className="max-w-md border-red-500 border-2">
					<DialogHeader>
						<DialogTitle className="flex items-center text-red-500">
							<IconLock className="mr-2 h-5 w-5" />
							<T id="password.demo.access-denied" />
						</DialogTitle>
					</DialogHeader>
					<div className="p-4 text-center text-muted-foreground">
						<p className="font-semibold">
							<T id="password.demo.disabled" />
						</p>
					</div>
					<DialogFooter>
						<Button variant="outline" onClick={remove}>
							<T id="action.close" />
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center">
						<IconLock className="mr-2 h-5 w-5" />
						<T id="user.change-password" />
					</DialogTitle>
				</DialogHeader>

				<Formik<ChangePasswordValues>
					initialValues={{
						current: "",
						new: "",
						confirm: "",
					}}
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
									{({ field }: FieldProps) => (
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
												aria-label={intl.formatMessage({
													id: showCurrent ? "password.hide" : "password.show",
												})}
												aria-pressed={showCurrent}
												className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
												onClick={() => setShowCurrent(!showCurrent)}
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
									{({ field }: FieldProps) => (
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
													aria-label={intl.formatMessage({
														id: showNew ? "password.hide" : "password.show",
													})}
													aria-pressed={showNew}
													className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
													onClick={() => setShowNew(!showNew)}
												>
													{showNew ? <IconEyeOff size={16} /> : <IconEye size={16} />}
												</Button>
											</div>
											<Button
												type="button"
												variant="outline"
												size="icon"
												title={intl.formatMessage({ id: "password.generate" })}
												aria-label={intl.formatMessage({ id: "password.generate" })}
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
									{({ field }: FieldProps) => (
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
												aria-label={intl.formatMessage({
													id: showConfirm ? "password.hide" : "password.show",
												})}
												aria-pressed={showConfirm}
												className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
												onClick={() => setShowConfirm(!showConfirm)}
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
