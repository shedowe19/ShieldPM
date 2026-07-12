import { IconRobot } from "@tabler/icons-react";
import { Field, Form, Formik, type FormikHelpers } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";
import { getAiConfig, updateAiConfig } from "src/api/backend/ai";
import type { AiConfig } from "src/api/backend/models";
import { Loading } from "src/components/Loading";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";
import { AI_PROVIDER, AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

export default function AiConfigPage() {
	const [config, setConfig] = useState<AiConfig | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [fetchedModels, setFetchedModels] = useState<{ id: string; name: string }[]>([]);

	useEffect(() => {
		getAiConfig()
			.then(setConfig)
			.catch((err) => setError(err.message))
			.finally(() => setIsLoading(false));
	}, []);

	const { formatMessage } = useIntl();

	const onSubmit = async (values: AiConfig, { setSubmitting }: FormikHelpers<AiConfig>) => {
		try {
			// Convert numeric fields from strings to integers
			const payload = {
				...values,
				num_ctx: values.num_ctx ? Number.parseInt(String(values.num_ctx), 10) : undefined,
				num_batch: values.num_batch ? Number.parseInt(String(values.num_batch), 10) : undefined,
				num_thread: values.num_thread ? Number.parseInt(String(values.num_thread), 10) : undefined,
			};
			const res = await updateAiConfig(payload as AiConfig);
			setConfig(res);
			showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.SETTING, "saved");
		} catch (err) {
			if (err instanceof Error) setError(err.message);
		} finally {
			setSubmitting(false);
		}
	};

	if (isLoading) return <Loading noLogo />;

	const initialValues: AiConfig = config || {
		enabled: false,
		provider: AI_PROVIDER.GEMINI,
		api_key: "",
		base_url: "",
		model: "",
	};

	return (
		<Formik initialValues={initialValues} onSubmit={onSubmit}>
			{({ values, setFieldValue, isSubmitting }) => (
				<Form>
					<Card className="border-t-4 border-indigo-500/50">
						<CardHeader>
							<CardTitle className="flex items-center gap-2">
								<IconRobot className="h-6 w-6" />
								<T id="ai.title" />
							</CardTitle>
							<CardDescription>
								<T id="ai.description" />
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-6">
							{error && (
								<Alert variant="destructive">
									<AlertCircle className="h-4 w-4" />
									<AlertTitle>
										<T id="notification.error" />
									</AlertTitle>
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							)}

							<div className="flex items-center space-x-2">
								<Switch
									checked={values.enabled}
									onCheckedChange={(checked) => setFieldValue("enabled", checked)}
									id="enabled"
								/>
								<Label htmlFor="enabled">
									<T id="ai.enable" />
								</Label>
							</div>

							<div className="space-y-2">
								<Label>
									<T id="ai.provider" />
								</Label>
								<div className="flex gap-4">
									{[AI_PROVIDER.GEMINI, AI_PROVIDER.LOCAL].map((option) => (
										<label
											key={option}
											className={`
                                                relative flex cursor-pointer rounded-lg border bg-card p-4 shadow-sm focus:outline-none 
                                                ${values.provider === option ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50"}
                                            `}
										>
											<input
												type="radio"
												name="provider"
												value={option}
												className="sr-only"
												checked={values.provider === option}
												onChange={() => {
													setFieldValue("provider", option);
													// Set default model based on provider to avoid invalid state
													setFieldValue(
														"model",
														option === AI_PROVIDER.GEMINI
															? "gemini-1.5-flash"
															: "gpt-3.5-turbo",
													);
												}}
											/>
											<span className="capitalize">
												{option === AI_PROVIDER.GEMINI ? "Google Gemini" : "Local LLM / OpenAI"}
											</span>
										</label>
									))}
								</div>
							</div>

							{values.provider === AI_PROVIDER.GEMINI && (
								<div className="space-y-4">
									<div className="space-y-2">
										<Label htmlFor="api_key">
											<T id="ai.api_key" />
										</Label>
										<Field name="api_key" as={Input} type="password" placeholder="AIza..." />
									</div>
									<div className="space-y-2">
										<div className="flex justify-between items-center">
											<Label htmlFor="model">
												<T id="ai.model" />
											</Label>
											<Button
												variant="outline"
												size="sm"
												type="button"
												onClick={async () => {
													if (!values.api_key) {
														showObjectSuccess("API Key Required", "");
														return;
													}
													try {
														const models = await import("src/api/backend/ai").then((m) =>
															m.getAiModels(values),
														);
														setFetchedModels(models);
														showObjectSuccess("Models Loaded", "");
													} catch (e) {
														if (e instanceof Error) setError(e.message);
													}
												}}
											>
												<T id="ai.fetch_models" />
											</Button>
										</div>
										{fetchedModels.length > 0 ? (
											<Field
												as="select"
												name="model"
												className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
											>
												<option value="" disabled>
													{formatMessage({ id: "frames.select_placeholder" }) ||
														"Select a model"}
												</option>
												{fetchedModels.map((m) => (
													<option key={m.id} value={m.id}>
														{m.name}
													</option>
												))}
											</Field>
										) : (
											<Field
												name="model"
												as={Input}
												placeholder={formatMessage({ id: "ai.model.placeholder" })}
											/>
										)}
										<p className="text-xs text-muted-foreground">Default: gemini-1.5-flash</p>
									</div>
								</div>
							)}

							{values.provider === AI_PROVIDER.LOCAL && (
								<div className="space-y-4">
									<div className="space-y-2">
										<Label htmlFor="base_url">
											<T id="ai.base_url" />
										</Label>
										<Field name="base_url" as={Input} placeholder="http://localhost:11434" />
										<p className="text-xs text-muted-foreground">
											Ollama: http://localhost:11434 | OpenAI: https://api.openai.com
										</p>
									</div>
									{/* Model Size Warning */}
									<div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
										<div className="flex items-start gap-3">
											<AlertCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
											<div className="text-sm">
												<p className="font-medium text-amber-500 mb-1">
													<T id="ai.local_warning_title" />
												</p>
												<p className="text-muted-foreground">
													<T id="ai.local_warning_text" />
												</p>
											</div>
										</div>
									</div>
									<div className="space-y-2">
										<Label htmlFor="api_key">
											<T id="ai.api_key" /> (Optional)
										</Label>
										<Field name="api_key" as={Input} type="password" placeholder="sk-..." />
									</div>
									<div className="space-y-2">
										<div className="flex justify-between items-center">
											<Label htmlFor="model">
												<T id="ai.model" />
											</Label>
											<Button
												variant="outline"
												size="sm"
												type="button"
												onClick={async () => {
													try {
														const models = await import("src/api/backend/ai").then((m) =>
															m.getAiModels(values),
														);
														setFetchedModels(models);
														showObjectSuccess("Models Loaded", "");
													} catch (e) {
														if (e instanceof Error) setError(e.message);
													}
												}}
											>
												<T id="ai.fetch_models" />
											</Button>
										</div>

										{fetchedModels.length > 0 ? (
											<Field
												as="select"
												name="model"
												className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
											>
												<option value="" disabled>
													{formatMessage({ id: "frames.select_placeholder" }) ||
														"Select a model"}
												</option>
												{fetchedModels.map((m) => (
													<option key={m.id} value={m.id}>
														{m.name}
													</option>
												))}
											</Field>
										) : (
											<Field name="model" as={Input} placeholder="llama3" />
										)}
									</div>

									<div className="space-y-2">
										<Label htmlFor="num_ctx">
											<T id="ai.context_window" />
										</Label>
										<Field name="num_ctx" as={Input} type="number" placeholder="8192" />
										<p className="text-xs text-muted-foreground">Default: 8192</p>
									</div>

									<div className="space-y-2">
										<Label htmlFor="num_batch">
											<T id="ai.batch_size" />
										</Label>
										<Field name="num_batch" as={Input} type="number" placeholder="512" />
										<p className="text-xs text-muted-foreground">Default: 512</p>
									</div>

									<div className="space-y-2">
										<Label htmlFor="num_thread">
											<T id="ai.cpu_threads" />
										</Label>
										<Field name="num_thread" as={Input} type="number" placeholder="4" />
										<p className="text-xs text-muted-foreground">Default: 4</p>
									</div>

									<div className="space-y-2">
										<Label htmlFor="keep_alive">
											<T id="ai.keep_alive" />
										</Label>
										<Field name="keep_alive" as={Input} placeholder="5m" />
										<p className="text-xs text-muted-foreground">Default: 5m (e.g. 5m, 1h, -1)</p>
									</div>

									<div className="space-y-2">
										<Label htmlFor="system_prompt">
											<T id="ai.system_prompt" />
										</Label>
										<Field
											name="system_prompt"
											as="textarea"
											rows={8}
											className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
											placeholder="Leave empty to use default prompt..."
										/>
										<p className="text-xs text-muted-foreground">
											Customize how the AI behaves. Leave empty for default.
										</p>
									</div>
								</div>
							)}

							<div className="flex justify-end pt-4">
								<Button
									type="submit"
									disabled={isSubmitting}
									className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
								>
									{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
									<T id="save" />
								</Button>
							</div>
						</CardContent>
					</Card>
				</Form>
			)}
		</Formik>
	);
}
