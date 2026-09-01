import { IconCheck, IconGitBranch, IconGitCommit, IconRefresh, IconX } from "@tabler/icons-react";
import { Field, type FieldProps, useFormikContext } from "formik";
import { Loader2 } from "lucide-react";
import type { ProxyHost } from "src/api/backend";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Switch } from "src/components/ui/switch";
import { useGitSyncStatus, useTriggerGitSync } from "src/hooks/useGitSync";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";
import { TIME_UNIT } from "src/types/enums";

interface Props {
	hostId: number | null;
}

export function GitSyncTab({ hostId }: Props) {
	const { values } = useFormikContext<ProxyHost>();
	const { data: status, isLoading, isError, error } = useGitSyncStatus(hostId);
	const { mutate: triggerSync, isPending: isSyncing } = useTriggerGitSync();

	const handleSync = () => {
		if (hostId) {
			triggerSync(hostId, {
				onSuccess: () => {
					showObjectSuccess("Git Sync", "started");
					// Status reload happens via hook invalidation
				},
			});
		}
	};

	return (
		<div className="space-y-4">
			<Alert
				variant="default"
				className="bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
			>
				<IconGitBranch className="h-4 w-4" />
				<AlertTitle>
					<T id="proxy-host.git-sync" />
				</AlertTitle>
				<AlertDescription>
					<T id="proxy-host.git-sync.description" />
				</AlertDescription>
			</Alert>

			<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
				<div className="md:col-span-2">
					<Field name="gitRepoUrl" validate={validateString(1, 255)}>
						{({ field, form }: FieldProps) => (
							<div className="space-y-2">
								<Label htmlFor="gitRepoUrl">
									<T id="proxy-host.git-sync.repo-url" />
								</Label>
								<Input
									id="gitRepoUrl"
									placeholder={intl.formatMessage({
										id: "proxy-host.git-sync.repo-url.placeholder",
									})}
									className={
										form.errors.gitRepoUrl && form.touched.gitRepoUrl ? "border-destructive" : ""
									}
									{...field}
								/>
								{form.errors.gitRepoUrl && form.touched.gitRepoUrl && (
									<p className="text-sm font-medium text-destructive">
										{form.errors.gitRepoUrl as string}
									</p>
								)}
							</div>
						)}
					</Field>
				</div>

				<div className="md:col-span-1">
					<Field name="gitBranch">
						{({ field, form }: FieldProps) => (
							<div className="space-y-2">
								<Label htmlFor="gitBranch">
									<T id="proxy-host.git-sync.branch" />
								</Label>
								<Input
									id="gitBranch"
									placeholder="main"
									className={
										form.errors.gitBranch && form.touched.gitBranch ? "border-destructive" : ""
									}
									{...field}
								/>
							</div>
						)}
					</Field>
				</div>

				<div className="md:col-span-1">
					<Field name="gitCredentials">
						{({ field }: FieldProps) => (
							<div className="space-y-2">
								<Label htmlFor="gitCredentials">
									<T id="proxy-host.git-sync.credentials" />
								</Label>
								<Input
									id="gitCredentials"
									type="password"
									placeholder={intl.formatMessage({
										id: "proxy-host.git-sync.credentials.placeholder",
									})}
									{...field}
								/>
							</div>
						)}
					</Field>
				</div>
			</div>

			<Card className="border-dashed">
				<CardContent className="p-4 space-y-4">
					<div className="flex items-center justify-between">
						<Label htmlFor="gitSyncEnabled" className="flex-1 cursor-pointer">
							<T id="proxy-host.git-sync.enable-polling" />
						</Label>
						<Field name="gitSyncEnabled" type="checkbox">
							{({ field, form }: FieldProps) => (
								<Switch
									id="gitSyncEnabled"
									checked={field.checked}
									onCheckedChange={(checked: boolean) =>
										form.setFieldValue("gitSyncEnabled", checked)
									}
								/>
							)}
						</Field>
					</div>

					{values.gitSyncEnabled && (
						<div className="grid grid-cols-2 gap-4 pt-2">
							<Field name="gitPollInterval">
								{({ field }: FieldProps) => (
									<div className="space-y-2">
										<Label htmlFor="gitPollInterval">
											<T id="proxy-host.git-sync.poll-interval" />
										</Label>
										<Input id="gitPollInterval" type="number" min={1} {...field} />
									</div>
								)}
							</Field>
							<Field name="gitPollUnit">
								{({ field, form }: FieldProps) => (
									<div className="space-y-2">
										<Label htmlFor="gitPollUnit">
											<T id="proxy-host.rate-limiting.unit" />
										</Label>
										<Select
											onValueChange={(val: string) => form.setFieldValue(field.name, val)}
											value={field.value}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value={TIME_UNIT.SECONDS}>
													<T id="proxy-host.git-sync.poll-unit.seconds" />
												</SelectItem>
												<SelectItem value={TIME_UNIT.MINUTES}>
													<T id="proxy-host.git-sync.poll-unit.minutes" />
												</SelectItem>
												<SelectItem value={TIME_UNIT.HOURS}>
													<T id="proxy-host.git-sync.poll-unit.hours" />
												</SelectItem>
											</SelectContent>
										</Select>
									</div>
								)}
							</Field>
						</div>
					)}
				</CardContent>
			</Card>

			{hostId && (
				<Card className="bg-muted/30">
					<CardContent className="p-4 space-y-4">
						<div className="flex items-center justify-between">
							<h4 className="font-semibold text-sm text-muted-foreground uppercase">
								<T id="column.status" />
							</h4>
							<Button variant="default" size="sm" onClick={handleSync} disabled={isSyncing || isLoading}>
								{isSyncing ? (
									<Loader2 className="mr-2 h-3 w-3 animate-spin" />
								) : (
									<IconRefresh className="mr-2 h-3 w-3" />
								)}
								<T id="proxy-host.git-sync.sync-now" />
							</Button>
						</div>

						{isLoading ? (
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="h-4 w-4 animate-spin" /> Loading status...
							</div>
						) : isError ? (
							<Alert variant="destructive">
								<IconX className="h-4 w-4" />
								<AlertTitle>Error loading status</AlertTitle>
								<AlertDescription>{error?.message || "Unknown error"}</AlertDescription>
							</Alert>
						) : (
							<div className="space-y-2 text-sm">
								<div className="flex justify-between items-center">
									<span className="text-muted-foreground">
										<T id="proxy-host.git-sync.last-sync" />
									</span>
									<span className="font-mono">
										{status?.gitLastSync ? new Date(status.gitLastSync).toLocaleString() : "-"}
									</span>
								</div>
								<div className="flex justify-between items-center">
									<span className="text-muted-foreground">
										<T id="proxy-host.git-sync.last-commit" />
									</span>
									<div className="flex items-center gap-1 font-mono">
										<IconGitCommit className="h-3 w-3" />
										{status?.gitLastCommit ? status.gitLastCommit.substring(0, 7) : "-"}
									</div>
								</div>

								{status?.gitLastError && (
									<Alert variant="destructive" className="mt-2 py-2">
										<IconX className="h-4 w-4" />
										<AlertTitle>
											<T id="error.title" />
										</AlertTitle>
										<AlertDescription className="font-mono text-xs break-all">
											{status.gitLastError}
										</AlertDescription>
									</Alert>
								)}

								{!status?.gitLastError && status?.gitLastSync && (
									<div className="flex items-center gap-2 text-emerald-600 mt-2">
										<IconCheck className="h-4 w-4" />
										<span>
											<T id="proxy-host.git-sync.success" />
										</span>
									</div>
								)}
							</div>
						)}
					</CardContent>
				</Card>
			)}
		</div>
	);
}
