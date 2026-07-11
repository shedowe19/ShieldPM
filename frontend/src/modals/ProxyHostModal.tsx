import { IconBolt, IconGitBranch, IconNote, IconSettings, IconShieldLock, IconTool } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, type FieldProps, Form, Formik, type FormikHelpers } from "formik";
import { AlertCircle, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import type { ProxyHost } from "src/api/backend";
import {
	AccessField,
	DomainNamesField,
	GitSyncTab,
	HasPermission,
	Loading,
	LocationsFields,
	NginxConfigField,
	NoteWarning,
	ServiceIcon,
	SSLCertificateField,
	SSLOptionsFields,
} from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Switch } from "src/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { Textarea } from "src/components/ui/textarea";
import { useProxyHost, useSetProxyHost, useUser } from "src/hooks";
import { intl, T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { validateOptionalNumber, validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import {
	AUDIT_LOG_OBJECT_TYPE,
	FORWARD_SCHEME,
	ICON_TYPE,
	PHP_VERSION,
	PROXY_HOST_TAB,
	TERMINAL_AUTH_TYPE,
} from "src/types/enums";
import { createProxyHostInitialValues, type ProxyHostFormValues } from "./ProxyHostModalFormValues";
import ProxyHostSecurityTab from "./ProxyHostSecurityTab";

const showProxyHostModal = (id: number | "new") => {
	EasyModal.show(ProxyHostModal, { id });
};

interface Props extends InnerModalProps {
	id: number | "new";
	visible: boolean;
	remove: () => void;
}

const ProxyHostModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data: currentUser, isLoading: userIsLoading, error: userError } = useUser("me");
	const { data, isLoading, error } = useProxyHost(id);
	const { mutate: setProxyHost } = useSetProxyHost();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: ProxyHostFormValues, { setSubmitting }: FormikHelpers<ProxyHostFormValues>) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		// Sanitize numeric fields that can be null
		const sanitizedValues = { ...values };
		if (sanitizedValues.advLimitReqRate === "" || Number.isNaN(Number(sanitizedValues.advLimitReqRate))) {
			sanitizedValues.advLimitReqRate = undefined;
		}
		if (sanitizedValues.advLimitReqBurst === "" || Number.isNaN(Number(sanitizedValues.advLimitReqBurst))) {
			sanitizedValues.advLimitReqBurst = undefined;
		}

		// Map frontend field to backend schema
		if (typeof sanitizedValues.crowdsecEnabled !== "undefined") {
			sanitizedValues.securityCrowdsec = sanitizedValues.crowdsecEnabled;
			delete sanitizedValues.crowdsecEnabled;
		}

		// Don't overwrite git credentials with empty string (user didn't change them)
		if (sanitizedValues.gitCredentials === "") {
			delete sanitizedValues.gitCredentials;
		}

		const { ...payload } = {
			id: id === "new" ? undefined : id,
			...sanitizedValues,
		};

		setProxyHost(payload as unknown as ProxyHost, {
			onError: (err: Error) => setErrorMsg(err.message ? <T id={err.message} /> : "Unknown error"),
			onSuccess: () => {
				showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.PROXY_HOST, "saved");
				remove();
			},
			onSettled: () => {
				setIsSubmitting(false);
				setSubmitting(false);
			},
		});
	};

	return (
		<Dialog open={visible} onOpenChange={(open: boolean) => !open && remove()}>
			<DialogContent className="max-h-[90vh] max-w-4xl p-0 gap-0 overflow-hidden flex flex-col">
				{!isLoading && (error || userError) && (
					<Alert variant="destructive" className="m-3">
						<AlertCircle className="h-4 w-4" />
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{error?.message || userError?.message || "Unknown error"}</AlertDescription>
					</Alert>
				)}
				{isLoading ||
					(userIsLoading && (
						<div className="p-8">
							<Loading noLogo />
						</div>
					))}
				{!isLoading && !userIsLoading && data && currentUser && (
					<Formik initialValues={createProxyHostInitialValues(data)} enableReinitialize onSubmit={onSubmit}>
						{() => (
							<Form className="flex flex-col h-full overflow-hidden">
								<DialogHeader className="px-6 py-4 border-b">
									<DialogTitle className="flex items-center gap-2 text-xl">
										<IconBolt className="h-6 w-6 text-primary" />
										<T
											id={data?.id ? "object.edit" : "object.add"}
											tData={{ object: AUDIT_LOG_OBJECT_TYPE.PROXY_HOST }}
										/>
									</DialogTitle>
								</DialogHeader>

								<div className="px-6 pt-4">
									<NoteWarning content={data?.note} />
								</div>

								<Tabs defaultValue={PROXY_HOST_TAB.DETAILS} className="flex-1 flex flex-col min-h-0">
									<div className="px-6 pt-4">
										<TabsList className="w-full justify-start">
											<TabsTrigger value={PROXY_HOST_TAB.DETAILS}>
												<T id="column.details" />
											</TabsTrigger>
											<TabsTrigger value={PROXY_HOST_TAB.LOCATIONS}>
												<T id="column.custom-locations" />
											</TabsTrigger>
											<TabsTrigger value={PROXY_HOST_TAB.SSL}>
												<T id="column.ssl" />
											</TabsTrigger>
											<TabsTrigger value={PROXY_HOST_TAB.SECURITY}>
												<IconShieldLock size={20} />
											</TabsTrigger>
											<TabsTrigger value={PROXY_HOST_TAB.ADVANCED} className="ml-auto">
												<IconSettings size={20} />
											</TabsTrigger>
											<TabsTrigger value={PROXY_HOST_TAB.MAINTENANCE}>
												<IconTool size={20} />
											</TabsTrigger>
											<TabsTrigger value={PROXY_HOST_TAB.NOTES}>
												<IconNote size={20} />
											</TabsTrigger>
											<Field name="forwardScheme">
												{({ field: schemeField }: FieldProps) =>
													schemeField.value === FORWARD_SCHEME.PATH && (
														<TabsTrigger
															value={PROXY_HOST_TAB.GIT_SYNC}
															className="text-emerald-500"
														>
															<IconGitBranch size={20} />
														</TabsTrigger>
													)
												}
											</Field>
										</TabsList>
									</div>

									<div className="flex-1 overflow-y-auto">
										<div className="px-6 py-4">
											{errorMsg && (
												<Alert variant="destructive" className="mb-4">
													<AlertCircle className="h-4 w-4" />
													<AlertTitle>Error</AlertTitle>
													<AlertDescription>{errorMsg}</AlertDescription>
												</Alert>
											)}
											<TabsContent value={PROXY_HOST_TAB.DETAILS} className="mt-0 space-y-4">
												<DomainNamesField isWildcardPermitted dnsProviderWildcardSupported />
												<div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
													<div className="md:col-span-3">
														<Field name="forwardScheme">
															{({ field, form }: FieldProps) => (
																<div className="space-y-2">
																	<Label htmlFor="forwardScheme">
																		<T id="host.forward-scheme" />
																	</Label>
																	<Select
																		onValueChange={(val: string) =>
																			form.setFieldValue(field.name, val)
																		}
																		value={field.value}
																	>
																		<SelectTrigger
																			id="forwardScheme"
																			className={
																				form.errors.forwardScheme &&
																				form.touched.forwardScheme
																					? "border-destructive"
																					: ""
																			}
																		>
																			<SelectValue placeholder="http" />
																		</SelectTrigger>
																		<SelectContent>
																			<SelectItem value={FORWARD_SCHEME.HTTP}>
																				http
																			</SelectItem>
																			<SelectItem value={FORWARD_SCHEME.HTTPS}>
																				https
																			</SelectItem>
																			<SelectItem value={FORWARD_SCHEME.PATH}>
																				path
																			</SelectItem>
																			<SelectItem value={FORWARD_SCHEME.GRPC}>
																				grpc
																			</SelectItem>
																			<SelectItem value={FORWARD_SCHEME.GRPCS}>
																				grpcs
																			</SelectItem>
																			<SelectItem value={FORWARD_SCHEME.TERMINAL}>
																				terminal
																			</SelectItem>
																		</SelectContent>
																	</Select>
																	{form.errors.forwardScheme &&
																		form.touched.forwardScheme && (
																			<p className="text-sm font-medium text-destructive">
																				{form.errors.forwardScheme as string}
																			</p>
																		)}
																</div>
															)}
														</Field>
													</div>
													<div className="md:col-span-6">
														<Field name="forwardHost" validate={validateString(1, 255)}>
															{({ field, form }: FieldProps) => (
																<div className="space-y-2">
																	<Label htmlFor="forwardHost">
																		<T id="proxy-host.forward-host" />
																	</Label>
																	<Input
																		id="forwardHost"
																		placeholder="example.com"
																		autoComplete="off"
																		className={
																			form.errors.forwardHost &&
																			form.touched.forwardHost
																				? "border-destructive"
																				: ""
																		}
																		{...field}
																	/>
																	{form.errors.forwardHost &&
																		form.touched.forwardHost && (
																			<p className="text-sm font-medium text-destructive">
																				{form.errors.forwardHost as string}
																			</p>
																		)}
																</div>
															)}
														</Field>
													</div>
													<div className="md:col-span-3">
														<Field
															name="forwardPort"
															validate={validateOptionalNumber(1, 65535)}
														>
															{({ field, form }: FieldProps) => (
																<div className="space-y-2">
																	<Label htmlFor="forwardPort">
																		<T id="host.forward-port" />
																	</Label>
																	<Input
																		id="forwardPort"
																		type="number"
																		min={1}
																		max={65535}
																		placeholder="eg: 8081"
																		className={
																			form.errors.forwardPort &&
																			form.touched.forwardPort
																				? "border-destructive"
																				: ""
																		}
																		{...field}
																	/>
																	{form.errors.forwardPort &&
																		form.touched.forwardPort && (
																			<p className="text-sm font-medium text-destructive">
																				{form.errors.forwardPort as string}
																			</p>
																		)}
																</div>
															)}
														</Field>
													</div>
												</div>

												{/* Index File Field - visible when scheme is 'path' */}
												<Field name="forwardScheme">
													{({ field: schemeField }: FieldProps) =>
														schemeField.value === FORWARD_SCHEME.PATH && (
															<div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-4">
																<div className="md:col-span-12">
																	<Field name="indexFile">
																		{({ field }: FieldProps) => (
																			<div className="space-y-2">
																				<Label htmlFor="indexFile">
																					<T id="proxy-host.index-file" />
																				</Label>
																				<Input
																					id="indexFile"
																					placeholder="index.php"
																					autoComplete="off"
																					{...field}
																				/>
																				<p className="text-xs text-muted-foreground">
																					<T id="proxy-host.index-file.hint" />
																				</p>
																			</div>
																		)}
																	</Field>
																</div>
															</div>
														)
													}
												</Field>

												{/* Terminal Fields */}
												<Field name="forwardScheme">
													{({ field: schemeField }: FieldProps) =>
														schemeField.value === FORWARD_SCHEME.TERMINAL && (
															<Card className="my-3 border-dashed border-yellow-500/50">
																<CardContent className="p-4">
																	<h4 className="pb-2 text-lg font-semibold text-yellow-500">
																		<T id="terminal.connection-details" />
																	</h4>
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
																				{({ field, form }: FieldProps) => (
																					<div className="space-y-2">
																						<Label htmlFor="terminalPort">
																							<T id="terminal.port" />
																						</Label>
																						<Input
																							id="terminalPort"
																							type="number"
																							placeholder="22"
																							className={
																								form.errors
																									.terminalPort &&
																								form.touched
																									.terminalPort
																									? "border-destructive"
																									: ""
																							}
																							{...field}
																						/>
																					</div>
																				)}
																			</Field>
																		</div>
																		<div className="md:col-span-6">
																			<Field name="terminalUsername">
																				{({ field }: FieldProps) => (
																					<div className="space-y-2">
																						<Label htmlFor="terminalUsername">
																							<T id="terminal.username" />
																						</Label>
																						<Input
																							id="terminalUsername"
																							placeholder="root"
																							autoComplete="new-password"
																							{...field}
																						/>
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
																							onValueChange={(
																								val: string,
																							) =>
																								field.onChange({
																									target: {
																										name: field.name,
																										value: val,
																									},
																								})
																							}
																							value={field.value}
																						>
																							<SelectTrigger>
																								<SelectValue />
																							</SelectTrigger>
																							<SelectContent>
																								<SelectItem
																									value={
																										TERMINAL_AUTH_TYPE.PASSWORD
																									}
																								>
																									<T id="terminal.auth-type.password" />
																								</SelectItem>
																								<SelectItem
																									value={
																										TERMINAL_AUTH_TYPE.KEY
																									}
																								>
																									<T id="terminal.auth-type.key" />
																								</SelectItem>
																							</SelectContent>
																						</Select>
																					</div>
																				)}
																			</Field>
																		</div>

																		{/* Auth Fields */}
																		<Field name="terminalAuthType">
																			{({ field: authField }: FieldProps) =>
																				authField.value ===
																				TERMINAL_AUTH_TYPE.PASSWORD ? (
																					<div className="col-span-12">
																						<Field name="terminalPassword">
																							{({
																								field,
																							}: FieldProps) => (
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
																							{({
																								field,
																							}: FieldProps) => (
																								<div className="space-y-2">
																									<Label htmlFor="terminalPrivateKey">
																										<T id="terminal.private-key" />
																									</Label>
																									<Textarea
																										id="terminalPrivateKey"
																										placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
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
																</CardContent>
															</Card>
														)
													}
												</Field>

												{/* Icon Settings */}
												<Card className="my-3 border-dashed border-blue-500/50">
													<CardContent className="p-4">
														<h4 className="pb-2 text-lg font-semibold text-blue-400">
															<T id="proxy-host.icon-settings" />
														</h4>
														<div className="grid grid-cols-12 gap-4">
															<div className="col-span-12 md:col-span-4">
																<Field name="iconType">
																	{({ field }: FieldProps) => (
																		<div className="space-y-2">
																			<Label htmlFor="iconType">
																				<T id="proxy-host.icon-type" />
																			</Label>
																			<Select
																				onValueChange={(val: string) =>
																					field.onChange({
																						target: {
																							name: field.name,
																							value: val,
																						},
																					})
																				}
																				value={field.value || ICON_TYPE.AUTO}
																			>
																				<SelectTrigger id="iconType">
																					<SelectValue />
																				</SelectTrigger>
																				<SelectContent>
																					<SelectItem value={ICON_TYPE.AUTO}>
																						<T id="proxy-host.icon-type.auto" />
																					</SelectItem>
																					<SelectItem
																						value={ICON_TYPE.CUSTOM}
																					>
																						<T id="proxy-host.icon-type.custom" />
																					</SelectItem>
																					<SelectItem value={ICON_TYPE.NONE}>
																						<T id="proxy-host.icon-type.none" />
																					</SelectItem>
																				</SelectContent>
																			</Select>
																		</div>
																	)}
																</Field>
															</div>
															<Field name="iconType">
																{({ field: typeField }: FieldProps) =>
																	typeField.value === ICON_TYPE.CUSTOM && (
																		<div className="col-span-12 md:col-span-8">
																			<Field name="iconUrl">
																				{({ field }: FieldProps) => (
																					<div className="space-y-2">
																						<Label htmlFor="iconUrl">
																							<T id="proxy-host.icon-url" />
																						</Label>
																						<Input
																							id="iconUrl"
																							placeholder="https://example.com/icon.png"
																							{...field}
																						/>
																						<p className="text-xs text-muted-foreground">
																							<T id="proxy-host.icon-url.hint" />
																						</p>
																					</div>
																				)}
																			</Field>
																		</div>
																	)
																}
															</Field>
														</div>
														{/* Icon Preview */}
														<Field name="forwardPort">
															{({ field: portField }: FieldProps) => (
																<Field name="forwardHost">
																	{({ field: hostField }: FieldProps) => (
																		<Field name="iconType">
																			{({ field: typeField }: FieldProps) => (
																				<Field name="iconUrl">
																					{({
																						field: urlField,
																					}: FieldProps) => (
																						<div className="mt-4 flex items-center gap-4">
																							<span className="text-sm text-muted-foreground">
																								<T id="proxy-host.icon-preview" />
																								:
																							</span>
																							<ServiceIcon
																								port={portField.value}
																								hostname={
																									hostField.value
																								}
																								customIconUrl={
																									urlField.value
																								}
																								iconType={
																									typeField.value ||
																									ICON_TYPE.AUTO
																								}
																								size={40}
																								showTooltip
																							/>
																						</div>
																					)}
																				</Field>
																			)}
																		</Field>
																	)}
																</Field>
															)}
														</Field>
													</CardContent>
												</Card>
												{/* PHP Settings - Only show when scheme is 'path' */}
												<Field name="forwardScheme">
													{({ field: schemeField }: FieldProps) =>
														schemeField.value === FORWARD_SCHEME.PATH && (
															<Card className="my-3 border-dashed border-purple-500/50">
																<CardContent className="p-4">
																	<h4 className="pb-2 text-lg font-semibold text-purple-400">
																		<T id="proxy-host.php-settings" />
																	</h4>
																	<p className="text-sm text-muted-foreground mb-4">
																		<T id="proxy-host.php-settings.hint" />
																	</p>
																	<div className="space-y-4">
																		<div className="flex items-center justify-between">
																			<Label
																				htmlFor="phpEnabled"
																				className="flex-1 cursor-pointer"
																			>
																				<T id="proxy-host.php-enabled" />
																			</Label>
																			<Field name="phpEnabled" type="checkbox">
																				{({ field, form }: FieldProps) => (
																					<Switch
																						id="phpEnabled"
																						checked={field.checked}
																						onCheckedChange={(
																							checked: boolean,
																						) =>
																							form.setFieldValue(
																								"phpEnabled",
																								checked,
																							)
																						}
																					/>
																				)}
																			</Field>
																		</div>

																		<Field name="phpEnabled" type="checkbox">
																			{({ field: phpField }: FieldProps) =>
																				phpField.checked && (
																					<>
																						<Field name="phpVersion">
																							{({
																								field,
																								form,
																							}: FieldProps) => (
																								<div className="space-y-2">
																									<Label htmlFor="phpVersion">
																										<T id="proxy-host.php-version" />
																									</Label>
																									<Select
																										onValueChange={(
																											val: string,
																										) =>
																											form.setFieldValue(
																												field.name,
																												val,
																											)
																										}
																										value={
																											field.value
																										}
																									>
																										<SelectTrigger id="phpVersion">
																											<SelectValue placeholder="PHP 8.3" />
																										</SelectTrigger>
																										<SelectContent>
																											<SelectItem
																												value={
																													PHP_VERSION.PHP82
																												}
																											>
																												PHP 8.2
																											</SelectItem>
																											<SelectItem
																												value={
																													PHP_VERSION.PHP83
																												}
																											>
																												PHP 8.3
																											</SelectItem>
																											<SelectItem
																												value={
																													PHP_VERSION.PHP84
																												}
																											>
																												PHP 8.4
																											</SelectItem>
																										</SelectContent>
																									</Select>
																								</div>
																							)}
																						</Field>

																						<Field name="php_override_ini">
																							{({
																								field,
																							}: FieldProps) => (
																								<div className="space-y-2 pt-2">
																									<Label htmlFor="php_override_ini">
																										<T id="proxy-host.php.custom-ini" />
																									</Label>
																									<Textarea
																										id="php_override_ini"
																										placeholder={intl.formatMessage(
																											{
																												id: "proxy-host.php.custom-ini.placeholder",
																											},
																										)}
																										className="font-mono text-xs min-h-[100px]"
																										{...field}
																										value={
																											field.value ||
																											""
																										}
																									/>
																									<p className="text-xs text-muted-foreground">
																										<T id="proxy-host.php.custom-ini.hint" />
																									</p>
																								</div>
																							)}
																						</Field>
																					</>
																				)
																			}
																		</Field>
																	</div>
																</CardContent>
															</Card>
														)
													}
												</Field>
												<div className="row">
													<div className="col-md-12">
														<Field name="bandwidthLimit">
															{({ field, form }: FieldProps) => (
																<div className="mb-3 space-y-2">
																	<Label htmlFor="bandwidthLimit">
																		<T id="proxy-host.bandwidth-limit" />
																	</Label>
																	<Input
																		id="bandwidthLimit"
																		placeholder={intl.formatMessage({
																			id: "form.placeholder.unlimited",
																		})}
																		className={
																			form.errors.bandwidthLimit &&
																			form.touched.bandwidthLimit
																				? "border-destructive"
																				: ""
																		}
																		{...field}
																	/>
																	{form.errors.bandwidthLimit &&
																		form.touched.bandwidthLimit && (
																			<p className="text-sm font-medium text-destructive">
																				{form.errors.bandwidthLimit as string}
																			</p>
																		)}
																</div>
															)}
														</Field>
													</div>
													<div className="col-md-12">
														<Field name="forwardQuery">
															{({ field, form }: FieldProps) => (
																<div className="mb-3 space-y-2">
																	<Label htmlFor="forwardQuery">
																		<T id="proxy-host.forward-query" />
																	</Label>
																	<Input
																		id="forwardQuery"
																		placeholder="e.g. api_key=123"
																		className={
																			form.errors.forwardQuery &&
																			form.touched.forwardQuery
																				? "border-destructive"
																				: ""
																		}
																		{...field}
																	/>
																	{form.errors.forwardQuery &&
																		form.touched.forwardQuery && (
																			<p className="text-sm font-medium text-destructive">
																				{form.errors.forwardQuery as string}
																			</p>
																		)}
																</div>
															)}
														</Field>
													</div>
												</div>
												<AccessField />
												<Card className="my-3 border-dashed">
													<CardContent className="p-4">
														<h4 className="pb-2 text-lg font-semibold">
															<T id="options" />
														</h4>
														<div className="space-y-4">
															<div className="flex items-center justify-between">
																<Label
																	htmlFor="cachingEnabled"
																	className="flex-1 cursor-pointer"
																>
																	<T id="host.flags.cache-assets" />
																</Label>
																<Field name="cachingEnabled" type="checkbox">
																	{({ field, form }: FieldProps) => (
																		<Switch
																			id="cachingEnabled"
																			checked={field.checked}
																			onCheckedChange={(checked: boolean) =>
																				form.setFieldValue(
																					"cachingEnabled",
																					checked,
																				)
																			}
																		/>
																	)}
																</Field>
															</div>
															<div className="flex items-center justify-between">
																<Label
																	htmlFor="disableBuffering"
																	className="flex-1 cursor-pointer"
																>
																	<T id="disableBuffering" />
																</Label>
																<Field name="disableBuffering" type="checkbox">
																	{({ field, form }: FieldProps) => (
																		<Switch
																			id="disableBuffering"
																			checked={field.checked}
																			onCheckedChange={(checked: boolean) =>
																				form.setFieldValue(
																					"disableBuffering",
																					checked,
																				)
																			}
																		/>
																	)}
																</Field>
															</div>
															<div className="flex items-center justify-between">
																<Label
																	htmlFor="blockExploits"
																	className="flex-1 cursor-pointer"
																>
																	<T id="host.flags.block-exploits" />
																</Label>
																<Field name="blockExploits" type="checkbox">
																	{({ field, form }: FieldProps) => (
																		<Switch
																			id="blockExploits"
																			checked={field.checked}
																			onCheckedChange={(checked: boolean) =>
																				form.setFieldValue(
																					"blockExploits",
																					checked,
																				)
																			}
																		/>
																	)}
																</Field>
															</div>
															<div className="flex items-center justify-between">
																<Label
																	htmlFor="allowWebsocketUpgrade"
																	className="flex-1 cursor-pointer"
																>
																	<T id="host.flags.websockets-upgrade" />
																</Label>
																<Field name="allowWebsocketUpgrade" type="checkbox">
																	{({ field, form }: FieldProps) => (
																		<Switch
																			id="allowWebsocketUpgrade"
																			checked={field.checked}
																			onCheckedChange={(checked: boolean) =>
																				form.setFieldValue(
																					"allowWebsocketUpgrade",
																					checked,
																				)
																			}
																		/>
																	)}
																</Field>
															</div>
															<div className="flex items-center justify-between">
																<Label
																	htmlFor="maintenanceOnFailure"
																	className="flex-1 cursor-pointer"
																>
																	<T id="host.flags.maintenance-on-failure" />
																</Label>
																<Field name="maintenanceOnFailure" type="checkbox">
																	{({ field, form }: FieldProps) => (
																		<Switch
																			id="maintenanceOnFailure"
																			checked={field.checked}
																			onCheckedChange={(checked: boolean) =>
																				form.setFieldValue(
																					"maintenanceOnFailure",
																					checked,
																				)
																			}
																		/>
																	)}
																</Field>
															</div>
														</div>
													</CardContent>
												</Card>
											</TabsContent>
											<TabsContent value={PROXY_HOST_TAB.LOCATIONS} className="mt-0">
												<LocationsFields initialValues={data?.locations || []} />
											</TabsContent>
											<TabsContent value={PROXY_HOST_TAB.SSL} className="mt-0">
												<SSLCertificateField
													name="certificateId"
													label="ssl-certificate"
													allowNew
												/>
												<SSLOptionsFields color="bg-lime" />
											</TabsContent>
											<ProxyHostSecurityTab />

											<TabsContent value={PROXY_HOST_TAB.ADVANCED} className="mt-0 space-y-4">
												<Alert variant="default" className="bg-muted/50 mt-4">
													<IconBolt className="h-4 w-4 text-emerald-500" />
													<AlertTitle>Turbo-Loader</AlertTitle>
													<AlertDescription>
														Intercept large static files and deliver a specialized HTML
														interface for maximum parallel download speeds in the browser.
													</AlertDescription>
												</Alert>

												<div className="flex items-center justify-between p-4 border rounded-lg bg-card/50">
													<div className="space-y-0.5">
														<Label
															htmlFor="turboLoader"
															className="text-base cursor-pointer"
														>
															Enable Multi-Part Injection
														</Label>
														<p className="text-sm text-muted-foreground">
															Converts specific files (.mp4, .zip, etc) into an
															accelerated HTML download page.
														</p>
													</div>
													<Field name="turboLoader" type="checkbox">
														{({ field, form }: FieldProps) => (
															<Switch
																id="turboLoader"
																checked={field.checked}
																onCheckedChange={(checked: boolean) =>
																	form.setFieldValue("turboLoader", checked)
																}
															/>
														)}
													</Field>
												</div>

												<NginxConfigField />
											</TabsContent>

											<TabsContent value={PROXY_HOST_TAB.MAINTENANCE} className="mt-0 space-y-4">
												<Alert variant="default" className="bg-muted/50">
													<IconTool className="h-4 w-4" />
													<AlertTitle>
														<T id="proxy-host.maintenance-mode" />
													</AlertTitle>
													<AlertDescription>
														<T id="proxy-host.maintenance.description" />
													</AlertDescription>
												</Alert>

												<div className="flex items-center justify-between p-4 border rounded-lg bg-card/50">
													<div className="space-y-0.5">
														<Label htmlFor="maintenanceActive" className="text-base">
															<T id="proxy-host.maintenance.active" />
														</Label>
														<p className="text-sm text-muted-foreground">
															<T id="proxy-host.maintenance.active.description" />
														</p>
													</div>
													<Field name="maintenanceActive" type="checkbox">
														{({ field, form }: FieldProps) => (
															<Switch
																id="maintenanceActive"
																checked={field.checked}
																onCheckedChange={(checked: boolean) =>
																	form.setFieldValue("maintenanceActive", checked)
																}
															/>
														)}
													</Field>
												</div>

												<div className="grid grid-cols-2 gap-4">
													<Field name="maintenanceStart">
														{({ field }: FieldProps) => (
															<div className="space-y-2">
																<Label htmlFor="maintenanceStart">
																	<T id="proxy-host.maintenance.start" />
																</Label>
																<Input
																	id="maintenanceStart"
																	type="datetime-local"
																	step="1"
																	{...field}
																/>
															</div>
														)}
													</Field>

													<Field name="maintenanceEnd">
														{({ field }: FieldProps) => (
															<div className="space-y-2">
																<Label htmlFor="maintenanceEnd">
																	<T id="proxy-host.maintenance.end" />
																</Label>
																<Input
																	id="maintenanceEnd"
																	type="datetime-local"
																	step="1"
																	{...field}
																/>
															</div>
														)}
													</Field>
												</div>

												<Field name="maintenanceReason">
													{({ field }: FieldProps) => (
														<div className="space-y-2">
															<Label htmlFor="maintenanceReason">
																<T id="proxy-host.maintenance.reason" />
															</Label>
															<Textarea
																id="maintenanceReason"
																placeholder={intl.formatMessage({
																	id: "proxy-host.maintenance.reason.placeholder",
																})}
																className="min-h-[100px]"
																{...field}
															/>
														</div>
													)}
												</Field>
											</TabsContent>

											<TabsContent value={PROXY_HOST_TAB.NOTES} className="mt-0 space-y-4 pt-4">
												<Field name="note">
													{({ field }: FieldProps) => (
														<div className="space-y-2 mb-4">
															<Label htmlFor="note">
																<T id="host.note" />
															</Label>
															<Textarea
																id="note"
																placeholder={intl.formatMessage({
																	id: "host.note.placeholder",
																})}
																className="min-h-[300px] font-mono text-sm"
																{...field}
															/>
															<p className="text-xs text-muted-foreground">
																<T id="host.note.hint" />
															</p>
														</div>
													)}
												</Field>
											</TabsContent>

											<Field name="forwardScheme">
												{({ field: schemeField }: FieldProps) =>
													schemeField.value === FORWARD_SCHEME.PATH && (
														<TabsContent
															value={PROXY_HOST_TAB.GIT_SYNC}
															className="mt-0 space-y-4"
														>
															<GitSyncTab hostId={typeof id === "number" ? id : null} />
														</TabsContent>
													)
												}
											</Field>
										</div>
									</div>
								</Tabs>

								<DialogFooter className="px-6 py-4 border-t">
									<Button variant="outline" onClick={() => remove()} type="button">
										<T id="cancel" />
									</Button>
									<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
										<Button
											type="submit"
											variant="default"
											className="bg-lime-600/90 text-white hover:bg-lime-600 shadow-sm"
											disabled={isSubmitting}
										>
											{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
											<T id="save" />
										</Button>
									</HasPermission>
								</DialogFooter>
							</Form>
						)}
					</Formik>
				)}
			</DialogContent>
		</Dialog>
	);
});

export { showProxyHostModal };
