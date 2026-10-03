import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { AlertCircle, CheckCircle2, FileUp, Loader2, ShieldBan } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { FirewallList, FirewallListInput, FirewallListPreview } from "src/api/backend/firewallLists";
import { Loading } from "src/components/Loading";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Switch } from "src/components/ui/switch";
import { Textarea } from "src/components/ui/textarea";
import { useFirewallList, usePreviewFirewallList, useSaveFirewallList } from "src/hooks/useFirewallLists";
import { intl, T } from "src/locale";
import { showSuccess } from "src/notifications";

export const FIREWALL_PRESETS = {
	vpn: "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt",
	datacenter: "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/datacenter/ipv4.txt",
} as const;

export type FirewallPreset = keyof typeof FIREWALL_PRESETS;

interface Props extends InnerModalProps {
	listId?: number;
	preset?: FirewallPreset;
}

export function showFirewallListModal(id?: number, preset?: FirewallPreset) {
	EasyModal.show(FirewallListModal, { listId: id, preset });
}

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

const defaultValues = (data?: FirewallList, preset?: FirewallPreset): FirewallListInput => ({
	name: data?.name ?? (preset ? `X4BNet ${preset === "vpn" ? "VPN" : "VPN + Datacenter"}` : ""),
	reason: data?.reason ?? (preset ? intl.formatMessage({ id: `firewall.preset.${preset}.reason` }) : ""),
	description: data?.description ?? "",
	sourceType: data?.sourceType ?? (preset ? "url" : "manual"),
	sourceUrl: data?.sourceUrl ?? (preset ? FIREWALL_PRESETS[preset] : ""),
	updateIntervalHours: data?.updateIntervalHours ?? 24,
	enabled: data?.enabled ?? true,
	entries: data?.entries ?? "",
});

function FirewallListForm({
	data,
	preset,
	onClose,
	onBusyChange,
}: {
	data?: FirewallList;
	preset?: FirewallPreset;
	onClose: () => void;
	onBusyChange: (busy: boolean) => void;
}) {
	const form = useForm<FirewallListInput>({
		defaultValues: defaultValues(data, preset),
	});
	const {
		reset,
		formState: { isDirty },
	} = form;
	useEffect(() => {
		// Opening a cached list may refetch newer values. Preserve any edits made before that response arrives.
		if (data && !isDirty) reset(defaultValues(data, preset));
	}, [data, isDirty, preset, reset]);
	const save = useSaveFirewallList();
	const preview = usePreviewFirewallList();
	const [checked, setChecked] = useState<{ input: string; result: FirewallListPreview } | null>(null);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [isReadingFile, setIsReadingFile] = useState(false);
	const fileInput = useRef<HTMLInputElement>(null);
	const fileReadRevision = useRef(0);
	const entries = form.watch("entries") ?? "";
	const sourceType = form.watch("sourceType");
	const busy = save.isPending || preview.isPending || isReadingFile;
	const currentPreview = checked?.input === entries ? checked.result : null;
	const manualValid = !!currentPreview && currentPreview.entries.length > 0 && currentPreview.invalid.length === 0;

	const checkEntries = async () => {
		onBusyChange(true);
		try {
			const input = form.getValues("entries") ?? "";
			const result = await preview.mutateAsync(input);
			setChecked({ input, result });
		} catch {
			// React Query exposes the validation error below the form.
		} finally {
			onBusyChange(false);
		}
	};

	const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		event.target.value = "";
		if (!file) return;
		setUploadError(null);
		if (!file.name.toLowerCase().endsWith(".txt") || file.size > MAX_UPLOAD_BYTES) {
			setUploadError(intl.formatMessage({ id: "firewall.import.fileError" }));
			return;
		}
		const revision = ++fileReadRevision.current;
		setIsReadingFile(true);
		onBusyChange(true);
		try {
			const text = await file.text();
			if (revision === fileReadRevision.current) {
				form.setValue("entries", text, { shouldDirty: true });
				setChecked(null);
			}
		} catch {
			setUploadError(intl.formatMessage({ id: "firewall.import.readError" }));
		} finally {
			setIsReadingFile(false);
			onBusyChange(false);
		}
	};

	const onSubmit = form.handleSubmit(async (values) => {
		if (busy || (values.sourceType === "manual" && !manualValid)) return;
		onBusyChange(true);
		try {
			await save.mutateAsync({
				id: data?.id,
				data: {
					...values,
					name: values.name.trim(),
					reason: values.reason.trim(),
					sourceUrl: values.sourceType === "url" ? values.sourceUrl.trim() : "",
					entries: values.sourceType === "manual" ? currentPreview?.entries.join("\n") : undefined,
				},
			});
			showSuccess(intl.formatMessage({ id: "firewall.saved" }));
			onClose();
		} catch {
			// Keep the input and show the server's error so the user can correct it.
		} finally {
			onBusyChange(false);
		}
	});

	return (
		<form onSubmit={onSubmit} className="space-y-5">
			<fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
				<div className="grid gap-4 sm:grid-cols-[1fr_auto]">
					<div className="space-y-2">
						<Label htmlFor="firewall-name">
							<T id="column.name" />
						</Label>
						<Input
							id="firewall-name"
							maxLength={255}
							required
							aria-invalid={!!form.formState.errors.name}
							{...form.register("name", {
								required: true,
								validate: (value) => value.trim().length > 0,
							})}
						/>
						{form.formState.errors.name && (
							<p className="text-xs text-destructive">
								<T id="firewall.fieldRequired" />
							</p>
						)}
					</div>
					<div className="flex items-center gap-3 sm:pt-7">
						<Switch
							id="firewall-list-enabled"
							checked={form.watch("enabled")}
							onCheckedChange={(enabled) => form.setValue("enabled", enabled, { shouldDirty: true })}
						/>
						<Label htmlFor="firewall-list-enabled">
							<T id="firewall.enabled" />
						</Label>
					</div>
				</div>
				<div className="space-y-2">
					<Label htmlFor="firewall-reason">
						<T id="firewall.reason" />
					</Label>
					<Textarea
						id="firewall-reason"
						rows={2}
						maxLength={2000}
						required
						aria-invalid={!!form.formState.errors.reason}
						{...form.register("reason", {
							required: true,
							validate: (value) => value.trim().length > 0,
						})}
					/>
					{form.formState.errors.reason && (
						<p className="text-xs text-destructive">
							<T id="firewall.fieldRequired" />
						</p>
					)}
					<p className="text-xs text-muted-foreground">
						<T id="firewall.reason.help" />
					</p>
				</div>
				<div className="space-y-2">
					<Label htmlFor="firewall-description">
						<T id="firewall.description" />
					</Label>
					<Textarea id="firewall-description" rows={2} maxLength={4000} {...form.register("description")} />
					<p className="text-xs text-muted-foreground">
						<T id="firewall.description.help" />
					</p>
				</div>
				<div className="space-y-2">
					<Label htmlFor="firewall-source">
						<T id="firewall.source" />
					</Label>
					<Select
						value={sourceType}
						disabled={busy}
						onValueChange={(value: "manual" | "url") => {
							form.setValue("sourceType", value, { shouldDirty: true });
							preview.reset();
						}}
					>
						<SelectTrigger id="firewall-source">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="manual">
								<T id="firewall.source.manual" />
							</SelectItem>
							<SelectItem value="url">
								<T id="firewall.source.url" />
							</SelectItem>
						</SelectContent>
					</Select>
				</div>
				{sourceType === "url" ? (
					<div className="rounded-lg border bg-muted/30 p-4 space-y-4">
						<div className="space-y-2">
							<Label htmlFor="firewall-source-url">
								<T id="firewall.sourceUrl" />
							</Label>
							<Input
								id="firewall-source-url"
								type="url"
								required
								placeholder="https://example.org/ips.txt"
								{...form.register("sourceUrl", { required: sourceType === "url" })}
							/>
							<p className="text-xs text-muted-foreground">
								<T id="firewall.sourceUrl.help" />
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="firewall-update-interval">
								<T id="firewall.updateInterval" />
							</Label>
							<Input
								id="firewall-update-interval"
								type="number"
								min={6}
								max={168}
								step={1}
								className="max-w-32"
								required
								{...form.register("updateIntervalHours", {
									valueAsNumber: true,
									min: 6,
									max: 168,
									required: true,
								})}
							/>
							<p className="text-xs text-muted-foreground">
								<T id="firewall.updateInterval.help" />
							</p>
						</div>
						{data && (
							<p className="text-sm text-muted-foreground">
								<T id="firewall.cachedEntries" data={{ count: data.entryCount }} />
							</p>
						)}
					</div>
				) : (
					<div className="rounded-lg border bg-muted/30 p-4 space-y-3">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<Label htmlFor="firewall-entries">
								<T id="firewall.entries" />
							</Label>
							<Button
								type="button"
								size="sm"
								variant="outline"
								onClick={() => fileInput.current?.click()}
							>
								<FileUp className="mr-2 h-4 w-4" />
								<T id="firewall.import.upload" />
							</Button>
						</div>
						<input
							ref={fileInput}
							type="file"
							accept=".txt,text/plain"
							className="hidden"
							aria-label={intl.formatMessage({ id: "firewall.import.upload" })}
							onChange={importFile}
						/>
						<Textarea
							id="firewall-entries"
							rows={8}
							className="font-mono text-xs"
							placeholder={"203.0.113.10\n198.51.100.0/24\n2001:db8::/32"}
							{...form.register("entries")}
						/>
						<p className="text-xs text-muted-foreground">
							<T id="firewall.entries.help" />
						</p>
						<Button
							type="button"
							size="sm"
							variant="secondary"
							onClick={checkEntries}
							disabled={!entries.trim()}
						>
							{preview.isPending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<CheckCircle2 className="mr-2 h-4 w-4" />
							)}
							<T id="firewall.import.preview" />
						</Button>
						{currentPreview ? (
							<div aria-live="polite" className="space-y-2 text-sm">
								<p
									className={
										manualValid ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
									}
								>
									<T
										id="firewall.import.summary"
										data={{
											valid: currentPreview.entries.length,
											duplicates: currentPreview.duplicates,
											invalid: currentPreview.invalid.length,
										}}
									/>
								</p>
								{currentPreview.invalid.length > 0 && (
									<>
										<p>
											<T id="firewall.import.correctErrors" />
										</p>
										<ul className="max-h-32 overflow-auto space-y-1 rounded border p-3 font-mono text-xs">
											{currentPreview.invalid.slice(0, 10).map((invalid) => (
												<li key={invalid.line} className="break-all">
													<T
														id="firewall.import.invalidLine"
														data={{
															line: invalid.line,
															value:
																invalid.value.length > 160
																	? `${invalid.value.slice(0, 160)}…`
																	: invalid.value,
														}}
													/>
												</li>
											))}
										</ul>
										{currentPreview.invalid.length > 10 && (
											<p className="text-xs text-muted-foreground">
												<T
													id="firewall.import.moreErrors"
													data={{ count: currentPreview.invalid.length - 10 }}
												/>
											</p>
										)}
									</>
								)}
							</div>
						) : (
							<p className="text-xs text-muted-foreground">
								<T id="firewall.import.required" />
							</p>
						)}
					</div>
				)}
			</fieldset>
			{(save.error || preview.error || uploadError) && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>{save.error?.message || preview.error?.message || uploadError}</AlertDescription>
				</Alert>
			)}
			<DialogFooter>
				<Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
					<T id="cancel" />
				</Button>
				<Button
					type="submit"
					disabled={busy || (sourceType === "manual" && !manualValid)}
					className="bg-cyan-600 hover:bg-cyan-700 text-white"
				>
					{save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
					<T id="save" />
				</Button>
			</DialogFooter>
		</form>
	);
}

const FirewallListModal = EasyModal.create(({ listId, preset, visible, remove }: Props) => {
	const query = useFirewallList(listId);
	const [busy, setBusy] = useState(false);
	return (
		<Dialog open={visible} onOpenChange={(open) => !open && !busy && remove()}>
			<DialogContent
				className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
				onEscapeKeyDown={(event) => busy && event.preventDefault()}
				onPointerDownOutside={(event) => busy && event.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<ShieldBan className="h-5 w-5" />
						<T id={typeof listId === "number" ? "firewall.edit" : "firewall.add"} />
					</DialogTitle>
					<DialogDescription>
						<T id="firewall.modalDescription" />
					</DialogDescription>
				</DialogHeader>
				{typeof listId === "number" && query.isPending ? (
					<Loading noLogo />
				) : query.error && !query.data ? (
					<Alert variant="destructive">
						<AlertDescription>{query.error.message}</AlertDescription>
					</Alert>
				) : (
					<>
						{query.error && (
							<Alert variant="destructive">
								<AlertDescription>{query.error.message}</AlertDescription>
							</Alert>
						)}
						<FirewallListForm data={query.data} preset={preset} onClose={remove} onBusyChange={setBusy} />
					</>
				)}
			</DialogContent>
		</Dialog>
	);
});
