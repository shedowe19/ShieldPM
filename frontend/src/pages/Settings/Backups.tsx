import { DatabaseBackup, Download, Loader2, ShieldCheck, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Alert } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { useInstanceBackups } from "src/hooks/useInstanceBackups";
import { intl, T } from "src/locale";

export default function Backups() {
	const { state, create, preflight, restore, cancel, upload, download, remove } = useInstanceBackups();
	const [name, setName] = useState("");
	const [password, setPassword] = useState("");
	const [selected, setSelected] = useState("");
	const [restorePassword, setRestorePassword] = useState("");
	const [confirmation, setConfirmation] = useState("");
	const [localError, setLocalError] = useState("");
	const fileInput = useRef<HTMLInputElement>(null);
	const operations = [create, preflight, restore, cancel, upload, download, remove];
	const busy =
		operations.some((operation) => operation.isPending) ||
		!!state.data?.jobs.some((job) => job.status === "running");
	const error = localError || state.error?.message || operations.find((operation) => operation.error)?.error?.message;
	const canUse = !!state.data && !state.error && !busy;
	const selectedExists = !!state.data?.backups.some((backup) => backup.id === selected);
	const clearRestore = () => {
		setRestorePassword("");
		setConfirmation("");
	};

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<DatabaseBackup className="size-5" />
						<T id="backups.title" />
					</CardTitle>
					<CardDescription>
						<T id="backups.description" />
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{error && (
						<Alert variant="destructive" role="alert">
							{error}
						</Alert>
					)}
					<Alert role="note">
						<T id="backups.trusted-archive-notice" />
					</Alert>
					<Alert role="note">
						<T id="backups.restart-notice" />
					</Alert>
					<Alert role="note">
						<T id="backups.password-notice" />
					</Alert>
					<p className="text-sm text-muted-foreground">
						<T id="backups.external-database-notice" />
					</p>
					{state.data?.pending && (
						<div role="status" className="rounded-md border p-3 space-y-2">
							<p>
								<T
									id={
										state.data.pending.phase === "rejected" ? "backups.rejected" : "backups.pending"
									}
								/>{" "}
								{state.data.pending.id}
							</p>
							<Button variant="outline" disabled={!canUse} onClick={() => cancel.mutate()}>
								<T id="backups.cancel-pending" />
							</Button>
						</div>
					)}
					<form
						className="grid gap-4 md:grid-cols-2"
						onSubmit={(event) => {
							event.preventDefault();
							if (!canUse || password.length < 12) return;
							create.mutate({ password, name }, { onSuccess: () => setPassword("") });
						}}
					>
						<div className="space-y-2">
							<Label htmlFor="backup-name">
								<T id="backups.name" />
							</Label>
							<Input
								id="backup-name"
								value={name}
								maxLength={80}
								disabled={busy}
								onChange={(event) => setName(event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="backup-password">
								<T id="backups.password" />
							</Label>
							<Input
								id="backup-password"
								type="password"
								autoComplete="new-password"
								value={password}
								minLength={12}
								maxLength={1024}
								disabled={busy}
								onChange={(event) => setPassword(event.target.value)}
								required
							/>
						</div>
						<Button type="submit" disabled={!canUse || password.length < 12}>
							<T id="backups.create" />
						</Button>
					</form>
					<p className="text-sm text-muted-foreground">
						<T
							id="backups.size-limit"
							data={{ size: ((state.data?.limits.maxBytes || 0) / 1024 ** 3).toFixed(0) }}
						/>
					</p>
					<div className="flex items-center gap-3">
						<Input
							ref={fileInput}
							className="max-w-md"
							type="file"
							accept=".spmb"
							disabled={!canUse}
							aria-label={intl.formatMessage({ id: "backups.archive-file" })}
							onChange={(event) => {
								setLocalError("");
								const file = event.target.files?.[0];
								if (!file) return;
								if (file.size > (state.data?.limits.maxBytes || 0)) {
									setLocalError(intl.formatMessage({ id: "backups.too-large" }));
									return;
								}
								upload.mutate(file, {
									onSuccess: () => {
										if (fileInput.current) fileInput.current.value = "";
									},
								});
							}}
						/>
						<Upload className="size-4 shrink-0" />
						<span className="text-sm">
							<T id="backups.upload" />
						</span>
					</div>
					{state.isLoading && (
						<Loader2 className="size-5 animate-spin" aria-label={intl.formatMessage({ id: "loading" })} />
					)}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>
						<T id="backups.archives" />
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					{state.data?.backups.length === 0 && (
						<p>
							<T id="backups.empty" />
						</p>
					)}
					{state.data?.backups.map((backup) => (
						<div
							key={backup.id}
							className={`flex flex-wrap items-center gap-3 rounded-md border p-3 ${backup.id === selected ? "border-primary" : ""}`}
						>
							<div className="min-w-0 flex-1">
								<p className="font-medium break-all">{backup.name || backup.id}</p>
								<p className="text-sm text-muted-foreground">
									{new Date(backup.createdOn).toLocaleString()} ·{" "}
									{(backup.size / 1024 ** 2).toFixed(2)} MiB · {backup.database || "?"} ·{" "}
									{backup.appVersion || "?"}
								</p>
							</div>
							<Button variant="outline" disabled={!canUse} onClick={() => download.mutate(backup.id)}>
								<Download className="mr-2 size-4" />
								<T id="backups.download" />
							</Button>
							<Button
								variant={backup.id === selected ? "default" : "outline"}
								disabled={!canUse || !!state.data?.pending}
								onClick={() => {
									setSelected(backup.id);
									clearRestore();
								}}
							>
								<T id="backups.select" />
							</Button>
							<Button
								variant="ghost"
								disabled={!canUse || state.data?.pending?.id === backup.id}
								onClick={() => {
									if (window.confirm(intl.formatMessage({ id: "backups.delete-confirm" })))
										remove.mutate(backup.id);
								}}
							>
								<T id="backups.delete" />
							</Button>
						</div>
					))}
				</CardContent>
			</Card>
			{selectedExists && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<ShieldCheck className="size-5" />
							<T id="backups.restore-title" />
						</CardTitle>
						<CardDescription className="break-all">{selected}</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="restore-password">
								<T id="backups.restore-password" />
							</Label>
							<Input
								id="restore-password"
								type="password"
								autoComplete="off"
								value={restorePassword}
								minLength={12}
								maxLength={1024}
								disabled={busy}
								onChange={(event) => setRestorePassword(event.target.value)}
							/>
						</div>
						<Button
							variant="outline"
							disabled={!canUse || restorePassword.length < 12}
							onClick={() =>
								preflight.mutate(
									{ id: selected, password: restorePassword },
									{ onSuccess: clearRestore },
								)
							}
						>
							<T id="backups.verify" />
						</Button>
						<p className="text-sm">
							<T id="backups.confirmation-notice" /> <code className="break-all">RESTORE {selected}</code>
						</p>
						<div className="space-y-2">
							<Label htmlFor="restore-confirmation">
								<T id="backups.confirmation" />
							</Label>
							<Input
								id="restore-confirmation"
								value={confirmation}
								autoComplete="off"
								disabled={busy}
								onChange={(event) => setConfirmation(event.target.value)}
							/>
						</div>
						<Button
							variant="destructive"
							disabled={
								!canUse ||
								!!state.data?.pending ||
								restorePassword.length < 12 ||
								confirmation !== `RESTORE ${selected}`
							}
							onClick={() =>
								restore.mutate(
									{ id: selected, password: restorePassword, confirmation },
									{ onSuccess: clearRestore },
								)
							}
						>
							<T id="backups.schedule-restore" />
						</Button>
					</CardContent>
				</Card>
			)}
			{state.data?.jobs.length ? (
				<Card>
					<CardHeader>
						<CardTitle>
							<T id="backups.jobs" />
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-2" aria-live="polite">
						{state.data.jobs.map((job) => (
							<div key={job.id} className="rounded border p-3">
								<p>
									<T id={`backups.kind.${job.kind}`} /> · <T id={`backups.phase.${job.phase}`} /> ·{" "}
									<T id={`backups.status.${job.status}`} />
								</p>
								{job.error && <p className="text-destructive">{job.error}</p>}
								{job.result?.valid && (
									<p>
										<T id="backups.verified" />
									</p>
								)}
								{job.result?.activation === "next_restart" && (
									<p>
										<T id="backups.pending" />
									</p>
								)}
							</div>
						))}
					</CardContent>
				</Card>
			) : null}
		</div>
	);
}
