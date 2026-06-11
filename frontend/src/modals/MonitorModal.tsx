import { IconHeartbeat } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { createMonitor, getMonitors, type Monitor, testMonitor, updateMonitor } from "src/api/backend";
import { Loading } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Textarea } from "src/components/ui/textarea";
import { intl, T } from "src/locale";
import { validateNumber, validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

const showMonitorModal = (id?: number) => {
	EasyModal.show(MonitorModal, { id: id || "new" });
};

interface Props extends InnerModalProps {
	id: number | "new";
	visible: boolean;
	remove: () => void;
}

interface MonitorValues {
	name: string;
	url: string;
	method: "GET" | "HEAD";
	intervalSeconds: number;
	timeoutSeconds: number;
	expectedStatus: number;
	expectedBody: string;
	failureThreshold: number;
}

const MonitorModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data: monitors, isLoading } = useQuery({
		queryKey: ["monitors"],
		queryFn: getMonitors,
		enabled: id !== "new",
	});
	const data = id && id !== "new" ? monitors?.find((monitor) => monitor.id === id) : null;
	const isEditing = id !== "new";
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [isTesting, setIsTesting] = useState(false);
	const [testResult, setTestResult] = useState<string | null>(null);

	const onSubmit = async (values: MonitorValues, { setSubmitting }: FormikHelpers<MonitorValues>) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		const payload: Partial<Monitor> = {
			name: values.name,
			url: values.url,
			method: values.method,
			intervalSeconds: Number(values.intervalSeconds),
			timeoutSeconds: Number(values.timeoutSeconds),
			expectedStatus: Number(values.expectedStatus),
			expectedBody: values.expectedBody.trim() || null,
			failureThreshold: Number(values.failureThreshold),
			type: "http",
			enabled: true,
			notificationEnabled: true,
		};

		try {
			if (typeof id === "number") {
				await updateMonitor(id, { ...payload, id });
				showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.MONITOR, "saved");
			} else {
				await createMonitor(payload);
				showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.MONITOR, "saved");
			}
			await queryClient.invalidateQueries({ queryKey: ["monitors"] });
			remove();
		} catch (err) {
			if (err instanceof Error) setErrorMsg(err.message);
		} finally {
			setIsSubmitting(false);
			setSubmitting(false);
		}
	};

	const handleTest = async () => {
		if (typeof id !== "number") return;
		setIsTesting(true);
		setTestResult(null);
		try {
			const result = await testMonitor(id);
			setTestResult(
				intl.formatMessage(
					{ id: "monitoring.test-result" },
					{ status: result.status, latency: result.latencyMs ?? "-" },
				),
			);
			await queryClient.invalidateQueries({ queryKey: ["monitors"] });
		} catch (err) {
			if (err instanceof Error) setTestResult(err.message);
		} finally {
			setIsTesting(false);
		}
	};

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconHeartbeat className="h-5 w-5" />
						<T id={isEditing ? "monitoring.edit" : "monitoring.add"} />
					</DialogTitle>
				</DialogHeader>

				{isLoading && isEditing ? (
					<Loading noLogo />
				) : (
					<Formik<MonitorValues>
						enableReinitialize
						initialValues={{
							name: data?.name || "",
							url: data?.url || "https://",
							method: data?.method || "GET",
							intervalSeconds: data?.intervalSeconds || 60,
							timeoutSeconds: data?.timeoutSeconds || 5,
							expectedStatus: data?.expectedStatus || 200,
							expectedBody: data?.expectedBody || "",
							failureThreshold: data?.failureThreshold || 3,
						}}
						onSubmit={onSubmit}
					>
						{({ values, setFieldValue }) => (
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

								<div className="space-y-2">
									<Label htmlFor="monitor-name">
										<T id="column.name" />
									</Label>
									<Field name="name" validate={validateString(1, 100)}>
										{({ field }: FieldProps) => (
											<Input
												{...field}
												id="monitor-name"
												placeholder={intl.formatMessage({ id: "monitoring.name.placeholder" })}
											/>
										)}
									</Field>
								</div>

								<div className="space-y-2">
									<Label htmlFor="monitor-url">
										<T id="monitoring.url" />
									</Label>
									<Field name="url" validate={validateString(8, 500)}>
										{({ field }: FieldProps) => (
											<Input
												{...field}
												id="monitor-url"
												placeholder="https://example.com/health"
											/>
										)}
									</Field>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
									<div className="space-y-2">
										<Label htmlFor="monitor-method">
											<T id="monitoring.method" />
										</Label>
										<Select
											value={values.method}
											onValueChange={(value) => setFieldValue("method", value)}
										>
											<SelectTrigger id="monitor-method">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="GET">GET</SelectItem>
												<SelectItem value="HEAD">HEAD</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="space-y-2">
										<Label htmlFor="expected-status">
											<T id="monitoring.expected-status" />
										</Label>
										<Field name="expectedStatus" validate={validateNumber(100, 599)}>
											{({ field }: FieldProps) => (
												<Input
													{...field}
													id="expected-status"
													type="number"
													min={100}
													max={599}
												/>
											)}
										</Field>
									</div>
								</div>

								<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
									<div className="space-y-2">
										<Label htmlFor="interval-seconds">
											<T id="monitoring.interval" />
										</Label>
										<Field name="intervalSeconds" validate={validateNumber(10, 86400)}>
											{({ field }: FieldProps) => (
												<Input {...field} id="interval-seconds" type="number" min={10} />
											)}
										</Field>
									</div>
									<div className="space-y-2">
										<Label htmlFor="timeout-seconds">
											<T id="monitoring.timeout" />
										</Label>
										<Field name="timeoutSeconds" validate={validateNumber(1, 120)}>
											{({ field }: FieldProps) => (
												<Input
													{...field}
													id="timeout-seconds"
													type="number"
													min={1}
													max={120}
												/>
											)}
										</Field>
									</div>
									<div className="space-y-2">
										<Label htmlFor="failure-threshold">
											<T id="monitoring.failure-threshold" />
										</Label>
										<Field name="failureThreshold" validate={validateNumber(1, 10)}>
											{({ field }: FieldProps) => (
												<Input
													{...field}
													id="failure-threshold"
													type="number"
													min={1}
													max={10}
												/>
											)}
										</Field>
									</div>
								</div>

								<div className="space-y-2">
									<Label htmlFor="expected-body">
										<T id="monitoring.expected-body" />
									</Label>
									<Field name="expectedBody">
										{({ field }: FieldProps) => (
											<Textarea
												{...field}
												id="expected-body"
												placeholder={intl.formatMessage({
													id: "monitoring.expected-body.placeholder",
												})}
											/>
										)}
									</Field>
								</div>

								{isEditing && (
									<div className="flex items-center gap-4 border-t pt-4">
										<Button
											type="button"
											variant="outline"
											size="sm"
											onClick={handleTest}
											disabled={isTesting}
										>
											{isTesting ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
											<T id="monitoring.test-now" />
										</Button>
										{testResult && <span className="text-xs font-mono">{testResult}</span>}
									</div>
								)}

								<DialogFooter>
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

export { showMonitorModal };
