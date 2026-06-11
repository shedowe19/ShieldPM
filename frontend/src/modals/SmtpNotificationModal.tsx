import { IconMail, IconSend } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { getSmtpNotificationConfig, testSmtpNotificationConfig, updateSmtpNotificationConfig } from "src/api/backend";
import { Loading } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { Textarea } from "src/components/ui/textarea";
import { intl, T } from "src/locale";
import { validateNumber, validateString } from "src/modules/Validations";
import { showSuccess } from "src/notifications";

const showSmtpNotificationModal = () => {
	EasyModal.show(SmtpNotificationModal, {});
};

interface Props extends InnerModalProps {
	visible: boolean;
	remove: () => void;
}

interface SmtpValues {
	enabled: boolean;
	host: string;
	port: number;
	secure: boolean;
	username: string;
	password: string;
	from: string;
	to: string;
	subjectPrefix: string;
}

const parseRecipients = (value: string) =>
	value
		.split(/[\n,;]/)
		.map((item) => item.trim())
		.filter(Boolean);

const SmtpNotificationModal = EasyModal.create(({ visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isTesting, setIsTesting] = useState(false);
	const { data, isLoading } = useQuery({
		queryKey: ["smtp-notification-config"],
		queryFn: getSmtpNotificationConfig,
	});

	const onSubmit = async (values: SmtpValues, { setSubmitting }: FormikHelpers<SmtpValues>) => {
		setErrorMsg(null);
		try {
			const payload = {
				enabled: values.enabled,
				host: values.host.trim(),
				port: Number(values.port),
				secure: values.secure,
				username: values.username.trim(),
				from: values.from.trim(),
				to: parseRecipients(values.to),
				subjectPrefix: values.subjectPrefix.trim(),
			};
			if (values.password.trim()) {
				Object.assign(payload, { password: values.password.trim() });
			}
			await updateSmtpNotificationConfig(payload);
			await queryClient.invalidateQueries({ queryKey: ["smtp-notification-config"] });
			showSuccess(intl.formatMessage({ id: "monitoring.smtp.saved" }));
			remove();
		} catch (err) {
			if (err instanceof Error) setErrorMsg(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	const handleTest = async (values: SmtpValues) => {
		setIsTesting(true);
		setErrorMsg(null);
		try {
			await testSmtpNotificationConfig({ to: parseRecipients(values.to) });
			showSuccess(intl.formatMessage({ id: "monitoring.smtp.test-sent" }));
		} catch (err) {
			if (err instanceof Error) setErrorMsg(err.message);
		} finally {
			setIsTesting(false);
		}
	};

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconMail className="h-5 w-5" />
						<T id="monitoring.smtp.title" />
					</DialogTitle>
				</DialogHeader>

				{isLoading ? (
					<Loading noLogo />
				) : (
					<Formik<SmtpValues>
						enableReinitialize
						initialValues={{
							enabled: data?.enabled || false,
							host: data?.host || "",
							port: data?.port || 587,
							secure: data?.secure || false,
							username: data?.username || "",
							password: "",
							from: data?.from || "",
							to: data?.to?.join("\\n") || "",
							subjectPrefix: data?.subjectPrefix || "[ShieldPM]",
						}}
						onSubmit={onSubmit}
					>
						{({ isSubmitting, setFieldValue, values }) => (
							<Form className="space-y-4">
								{errorMsg && (
									<Alert variant="destructive">
										<AlertCircle className="h-4 w-4" />
										<AlertTitle>
											<T id="notification.error" />
										</AlertTitle>
										<AlertDescription>{errorMsg}</AlertDescription>
									</Alert>
								)}

								<div className="rounded-md border p-3 text-sm text-muted-foreground">
									<T id="monitoring.smtp.description" />
								</div>

								<div className="flex items-center justify-between rounded-md border p-3">
									<div>
										<Label htmlFor="smtp-enabled">
											<T id="monitoring.smtp.enabled" />
										</Label>
										<p className="text-xs text-muted-foreground">
											<T id="monitoring.smtp.enabled-description" />
										</p>
									</div>
									<Switch
										id="smtp-enabled"
										checked={values.enabled}
										onCheckedChange={(checked) => setFieldValue("enabled", checked)}
									/>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									<div className="space-y-2 md:col-span-2">
										<Label htmlFor="smtp-host">
											<T id="monitoring.smtp.host" />
										</Label>
										<Field
											name="host"
											validate={values.enabled ? validateString(1, 255) : undefined}
										>
											{({ field }: FieldProps) => (
												<Input {...field} id="smtp-host" placeholder="smtp.example.com" />
											)}
										</Field>
									</div>
									<div className="space-y-2">
										<Label htmlFor="smtp-port">
											<T id="monitoring.smtp.port" />
										</Label>
										<Field name="port" validate={validateNumber(1, 65535)}>
											{({ field }: FieldProps) => (
												<Input {...field} id="smtp-port" type="number" min={1} max={65535} />
											)}
										</Field>
									</div>
								</div>

								<div className="flex items-center justify-between rounded-md border p-3">
									<Label htmlFor="smtp-secure">
										<T id="monitoring.smtp.secure" />
									</Label>
									<Switch
										id="smtp-secure"
										checked={values.secure}
										onCheckedChange={(checked) => setFieldValue("secure", checked)}
									/>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="smtp-username">
											<T id="monitoring.smtp.username" />
										</Label>
										<Field name="username">
											{({ field }: FieldProps) => (
												<Input {...field} id="smtp-username" autoComplete="username" />
											)}
										</Field>
									</div>
									<div className="space-y-2">
										<Label htmlFor="smtp-password">
											<T id="monitoring.smtp.password" />
										</Label>
										<Field name="password">
											{({ field }: FieldProps) => (
												<Input
													{...field}
													id="smtp-password"
													type="password"
													autoComplete="new-password"
													placeholder={
														data?.passwordSet
															? intl.formatMessage({
																	id: "monitoring.smtp.password-keep",
																})
															: undefined
													}
												/>
											)}
										</Field>
									</div>
								</div>

								<div className="space-y-2">
									<Label htmlFor="smtp-from">
										<T id="monitoring.smtp.from" />
									</Label>
									<Field name="from" validate={values.enabled ? validateString(1, 255) : undefined}>
										{({ field }: FieldProps) => (
											<Input
												{...field}
												id="smtp-from"
												placeholder="ShieldPM <alerts@example.com>"
											/>
										)}
									</Field>
								</div>

								<div className="space-y-2">
									<Label htmlFor="smtp-to">
										<T id="monitoring.smtp.to" />
									</Label>
									<Field name="to" validate={values.enabled ? validateString(1, 2000) : undefined}>
										{({ field }: FieldProps) => (
											<Textarea
												{...field}
												id="smtp-to"
												placeholder={intl.formatMessage({
													id: "monitoring.smtp.to-placeholder",
												})}
											/>
										)}
									</Field>
								</div>

								<div className="space-y-2">
									<Label htmlFor="smtp-subject-prefix">
										<T id="monitoring.smtp.subject-prefix" />
									</Label>
									<Field name="subjectPrefix">
										{({ field }: FieldProps) => (
											<Input {...field} id="smtp-subject-prefix" placeholder="[ShieldPM]" />
										)}
									</Field>
								</div>

								<DialogFooter className="gap-2 sm:gap-0">
									<Button
										type="button"
										variant="outline"
										onClick={() => handleTest(values)}
										disabled={isTesting || isSubmitting}
									>
										{isTesting ? (
											<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										) : (
											<IconSend className="mr-2 h-4 w-4" />
										)}
										<T id="monitoring.smtp.send-test" />
									</Button>
									<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
										<T id="cancel" />
									</Button>
									<Button
										type="submit"
										disabled={isSubmitting}
										className="bg-emerald-600/90 hover:bg-emerald-600 text-white shadow-sm"
									>
										{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
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

export { showSmtpNotificationModal };
