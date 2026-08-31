import { IconDice, IconEye, IconEyeOff, IconLock } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers } from "formik";
import { generate } from "generate-password-browser";
import { AlertCircle } from "lucide-react";
import { type ReactNode, useState } from "react";
import { updateAuth } from "src/api/backend";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";

const showSetPasswordModal = (id: number) => {
	EasyModal.show(SetPasswordModal, { id });
};

interface Props extends InnerModalProps {
	id: number;
}
interface SetPasswordValues {
	current: string;
	new: string;
}

const SetPasswordModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const [error, setError] = useState<ReactNode | null>(null);
	const [showPassword, setShowPassword] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: SetPasswordValues, { setSubmitting }: FormikHelpers<SetPasswordValues>) => {
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

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-md">
				<Formik<SetPasswordValues>
					initialValues={{
						current: "",
						new: "",
					}}
					onSubmit={onSubmit}
				>
					{({ errors, touched, setFieldValue }) => (
						<Form>
							<DialogHeader>
								<DialogTitle className="flex items-center">
									<IconLock className="mr-2 h-5 w-5" />
									<T id="user.set-password" />
								</DialogTitle>
							</DialogHeader>

							{error && (
								<Alert variant="destructive" className="my-4">
									<AlertCircle className="h-4 w-4" />
									<AlertTitle>Error</AlertTitle>
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							<div className="grid gap-4 py-4">
								<Field name="current" validate={validateString(1, 100)}>
									{({ field }: FieldProps) => (
										<div className="space-y-2">
											<Label htmlFor="current">
												<T id="user.current-password" />
											</Label>
											<Input
												{...field}
												id="current"
												type="password"
												autoComplete="current-password"
												required
												className={
													errors.current && touched.current ? "border-destructive" : ""
												}
											/>
											{errors.current && touched.current && (
												<p className="text-sm text-destructive">{errors.current as string}</p>
											)}
										</div>
									)}
								</Field>
								<Field name="new" validate={validateString(12, 100)}>
									{({ field }: FieldProps) => (
										<div className="space-y-2">
											<Label htmlFor="new">
												<T id="user.new-password" />
											</Label>
											<div className="flex gap-2">
												<div className="relative flex-1">
													<Input
														id="new"
														type={showPassword ? "text" : "password"}
														required
														className={
															errors.new && touched.new
																? "border-destructive pr-10"
																: "pr-10"
														}
														placeholder={intl.formatMessage({ id: "user.new-password" })}
														autoComplete="off"
														{...field}
													/>
													<Button
														type="button"
														variant="ghost"
														size="icon"
														aria-label={intl.formatMessage({
															id: showPassword ? "password.hide" : "password.show",
														})}
														aria-pressed={showPassword}
														className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
														onClick={() => setShowPassword(!showPassword)}
													>
														{showPassword ? (
															<IconEyeOff size={16} />
														) : (
															<IconEye size={16} />
														)}
													</Button>
												</div>
												<Button
													type="button"
													variant="outline"
													size="icon"
													title={intl.formatMessage({ id: "password.generate" })}
													aria-label={intl.formatMessage({ id: "password.generate" })}
													onClick={() => {
														setFieldValue(
															field.name,
															generate({
																length: 16,
																numbers: true,
																symbols: true,
																strict: true,
															}),
														);
														setShowPassword(true);
													}}
												>
													<IconDice size={16} />
												</Button>
											</div>
											{errors.new && touched.new && (
												<p className="text-sm text-destructive">{errors.new as string}</p>
											)}
										</div>
									)}
								</Field>
							</div>

							<DialogFooter>
								<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button
									type="submit"
									disabled={isSubmitting}
									className="bg-orange-600/90 hover:bg-orange-600 text-white shadow-sm"
								>
									{isSubmitting ? "..." : <T id="save" />}
								</Button>
							</DialogFooter>
						</Form>
					)}
				</Formik>
			</DialogContent>
		</Dialog>
	);
});

export { showSetPasswordModal };
