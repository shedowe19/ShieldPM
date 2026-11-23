import { Field, type FieldProps } from "formik";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Textarea } from "src/components/ui/textarea";
import { T } from "src/locale";
import { FORWARD_SCHEME, TERMINAL_AUTH_TYPE } from "src/types/enums";

const privateKeyPlaceholder = ["-----BEGIN", "OPENSSH", "PRIVATE", "KEY-----"].join(" ");

const ProxyHostTerminalFields = () => (
	<Field name="forwardScheme">
		{({ field: schemeField }: FieldProps) =>
			schemeField.value === FORWARD_SCHEME.TERMINAL && (
				<fieldset className="my-3 rounded-lg border border-dashed border-yellow-600/60 bg-card/50 p-4 dark:border-yellow-500/50">
					<legend className="px-1 text-lg font-semibold text-amber-700 dark:text-amber-400">
						<T id="terminal.connection-details" />
					</legend>
					<div className="grid grid-cols-1 md:grid-cols-12 gap-4">
						<div className="md:col-span-8">
							<Field name="terminalHost">
								{({ field }: FieldProps) => (
									<div className="space-y-2">
										<Label htmlFor="terminalHost">
											<T id="terminal.host" />
										</Label>
										<Input
											id="terminalHost"
											placeholder="192.168.1.100"
											autoComplete="off"
											{...field}
										/>
									</div>
								)}
							</Field>
						</div>
						<div className="md:col-span-4">
							<Field name="terminalPort">
								{({ field, form }: FieldProps) => {
									const invalid = Boolean(form.errors.terminalPort && form.touched.terminalPort);
									return (
										<div className="space-y-2">
											<Label htmlFor="terminalPort">
												<T id="terminal.port" />
											</Label>
											<Input
												id="terminalPort"
												type="number"
												placeholder="22"
												aria-invalid={invalid ? true : undefined}
												aria-describedby={invalid ? "terminalPort-error" : undefined}
												className={invalid ? "border-destructive" : ""}
												{...field}
											/>
											{invalid && (
												<p
													id="terminalPort-error"
													role="alert"
													className="text-sm text-destructive"
												>
													{String(form.errors.terminalPort)}
												</p>
											)}
										</div>
									);
								}}
							</Field>
						</div>
						<div className="md:col-span-6">
							<Field name="terminalUsername">
								{({ field }: FieldProps) => (
									<div className="space-y-2">
										<Label htmlFor="terminalUsername">
											<T id="terminal.username" />
										</Label>
										<Input id="terminalUsername" placeholder="root" autoComplete="off" {...field} />
									</div>
								)}
							</Field>
						</div>
						<div className="md:col-span-6">
							<Field name="terminalAuthType">
								{({ field }: FieldProps) => (
									<div className="space-y-2">
										<Label htmlFor="terminalAuthType">
											<T id="terminal.auth-type" />
										</Label>
										<Select
											onValueChange={(value: string) =>
												field.onChange({ target: { name: field.name, value } })
											}
											value={field.value}
										>
											<SelectTrigger id="terminalAuthType">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value={TERMINAL_AUTH_TYPE.PASSWORD}>
													<T id="terminal.auth-type.password" />
												</SelectItem>
												<SelectItem value={TERMINAL_AUTH_TYPE.KEY}>
													<T id="terminal.auth-type.key" />
												</SelectItem>
											</SelectContent>
										</Select>
									</div>
								)}
							</Field>
						</div>

						<Field name="terminalAuthType">
							{({ field: authField }: FieldProps) =>
								authField.value === TERMINAL_AUTH_TYPE.PASSWORD ? (
									<div className="col-span-12">
										<Field name="terminalPassword">
											{({ field }: FieldProps) => (
												<div className="space-y-2">
													<Label htmlFor="terminalPassword">
														<T id="terminal.password" />
													</Label>
													<Input
														id="terminalPassword"
														type="password"
														placeholder="••••••••"
														autoComplete="new-password"
														{...field}
													/>
												</div>
											)}
										</Field>
									</div>
								) : (
									<div className="col-span-12">
										<Field name="terminalPrivateKey">
											{({ field }: FieldProps) => (
												<div className="space-y-2">
													<Label htmlFor="terminalPrivateKey">
														<T id="terminal.private-key" />
													</Label>
													<Textarea
														id="terminalPrivateKey"
														placeholder={privateKeyPlaceholder}
														className="font-mono text-xs min-h-[100px]"
														{...field}
													/>
												</div>
											)}
										</Field>
									</div>
								)
							}
						</Field>
					</div>
				</fieldset>
			)
		}
	</Field>
);

export default ProxyHostTerminalFields;
