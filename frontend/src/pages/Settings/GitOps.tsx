import { IconGitBranch } from "@tabler/icons-react";
import {
	AlertCircle,
	ArrowDownToLine,
	ArrowUpFromLine,
	Clock,
	GitCommit,
	Loader2,
	RotateCcw,
	Server,
	TestTube,
} from "lucide-react";
import { useState } from "react";
import { Loading } from "src/components/Loading";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { T } from "src/locale";
import { GITOPS_AUTH_TYPE, type GitOpsAuthType } from "src/types/enums";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useGitOps, useGitOpsConfig, useGitOpsHistory } from "@/hooks/useGitOps";

export default function GitOps() {
	const { data: config, isLoading, error: fetchError } = useGitOpsConfig();
	const { data: history } = useGitOpsHistory(10);
	const { updateConfig, testConnection, push, pull, revert, importConfig } = useGitOps();

	const [formData, setFormData] = useState({
		enabled: false,
		repositoryUrl: "",
		branch: "main",
		authType: GITOPS_AUTH_TYPE.HTTPS as GitOpsAuthType,
		credentials: "",
		autoPush: false,
		autoPullOnStartup: false,
	});

	const [isInitialized, setIsInitialized] = useState(false);
	const [openRevertId, setOpenRevertId] = useState<string | null>(null);

	// Initialize form data when config is loaded
	if (config && !isInitialized) {
		setFormData({
			enabled: config.enabled,
			repositoryUrl: config.repositoryUrl || "",
			branch: config.branch || "main",
			authType: config.authType || GITOPS_AUTH_TYPE.HTTPS,
			credentials: "", // Never populate credentials from server
			autoPush: config.autoPush,
			autoPullOnStartup: config.autoPullOnStartup,
		});
		setIsInitialized(true);
	}

	const handleSave = async () => {
		const payload: Partial<typeof formData> = { ...formData };
		if (!payload.credentials) delete payload.credentials;
		updateConfig.mutate(payload, {
			onSuccess: () => setFormData((current) => ({ ...current, credentials: "" })),
		});
	};

	if (isLoading) return <Loading noLogo />;

	return (
		<div className="space-y-6">
			{/* Main Configuration Card */}
			<Card className="border-t-4 border-emerald-500/50">
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<IconGitBranch className="h-6 w-6" />
						<T id="settings.gitops.title" />
					</CardTitle>
					<CardDescription>
						<T id="settings.gitops.description" />
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					{fetchError && (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>Error</AlertTitle>
							<AlertDescription>{fetchError.message}</AlertDescription>
						</Alert>
					)}

					{config?.lastError && (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>Last Sync Error</AlertTitle>
							<AlertDescription>{config.lastError}</AlertDescription>
						</Alert>
					)}

					{/* Enable Toggle */}
					<div className="flex items-center space-x-2">
						<Switch
							checked={formData.enabled}
							onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
							id="enabled"
						/>
						<Label htmlFor="enabled">
							<T id="settings.gitops.enable" />
						</Label>
					</div>

					{/* Repository URL */}
					<div className="space-y-2">
						<Label htmlFor="repositoryUrl">
							<T id="settings.gitops.repository_url" />
						</Label>
						<Input
							id="repositoryUrl"
							value={formData.repositoryUrl}
							onChange={(e) => setFormData({ ...formData, repositoryUrl: e.target.value })}
							placeholder="https://github.com/user/shieldpm-backup.git"
						/>
					</div>

					{/* Branch */}
					<div className="space-y-2">
						<Label htmlFor="branch">
							<T id="settings.gitops.branch" />
						</Label>
						<Input
							id="branch"
							value={formData.branch}
							onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
							placeholder="main"
						/>
					</div>

					{/* Auth Type */}
					<div className="space-y-2">
						<Label>
							<T id="settings.gitops.auth_type" />
						</Label>
						<div className="flex gap-4">
							{[GITOPS_AUTH_TYPE.HTTPS].map((option) => (
								<label
									key={option}
									className={`
										relative flex cursor-pointer rounded-lg border bg-card p-4 shadow-sm focus:outline-none 
										${formData.authType === option ? "border-primary ring-1 ring-primary" : "border-border hover:border-primary/50"}
									`}
								>
									<input
										type="radio"
										name="authType"
										value={option}
										className="sr-only"
										checked={formData.authType === option}
										onChange={() => setFormData({ ...formData, authType: option })}
									/>
									<span className="uppercase text-sm font-medium">HTTPS (PAT)</span>
								</label>
							))}
						</div>
					</div>

					{/* Credentials */}
					<div className="space-y-2">
						<Label htmlFor="credentials">Personal Access Token</Label>
						<Input
							id="credentials"
							type="password"
							value={formData.credentials}
							onChange={(e) => setFormData({ ...formData, credentials: e.target.value })}
							placeholder="ghp_... or glpat-..."
							autoComplete="new-password"
						/>
						{config?.hasCredentials && (
							<div className="flex items-center justify-between gap-4">
								<p className="text-xs text-muted-foreground">
									A PAT is configured. Leave this field empty to keep it.
								</p>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => updateConfig.mutate({ credentials: "" })}
									disabled={updateConfig.isPending}
								>
									Remove PAT
								</Button>
							</div>
						)}
					</div>

					{/* Auto Options */}
					<div className="rounded-lg border p-4 space-y-4">
						<div className="flex items-center space-x-2">
							<Switch
								checked={formData.autoPush}
								onCheckedChange={(checked) => setFormData({ ...formData, autoPush: checked })}
								id="autoPush"
							/>
							<Label htmlFor="autoPush">
								<T id="settings.gitops.auto_push" />
							</Label>
						</div>
						<div className="flex items-center space-x-2">
							<Switch
								checked={formData.autoPullOnStartup}
								onCheckedChange={(checked) => setFormData({ ...formData, autoPullOnStartup: checked })}
								id="autoPullOnStartup"
							/>
							<Label htmlFor="autoPullOnStartup">
								<T id="settings.gitops.auto_pull" />
							</Label>
						</div>
					</div>

					{/* Status Display */}
					{config?.lastSync && (
						<div className="flex items-center gap-2 text-sm text-muted-foreground">
							<Clock className="h-4 w-4" />
							<span>Last Sync: {new Date(config.lastSync).toLocaleString()}</span>
						</div>
					)}

					{/* Action Buttons */}
					<div className="flex flex-wrap gap-2 pt-4">
						<Button
							variant="outline"
							onClick={() => testConnection.mutate()}
							disabled={testConnection.isPending || !formData.repositoryUrl}
						>
							{testConnection.isPending ? (
								<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							) : (
								<TestTube className="mr-2 h-4 w-4" />
							)}
							<T id="settings.gitops.test_connection" />
						</Button>

						<Button
							onClick={handleSave}
							disabled={updateConfig.isPending}
							className="bg-emerald-600 hover:bg-emerald-700 text-white"
						>
							{updateConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							<T id="save" />
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Actions Card */}
			{formData.enabled && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-lg">
							<Server className="h-5 w-5" />
							Actions
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
							<Button
								variant="outline"
								className="h-auto py-4 flex-col"
								onClick={() => push.mutate(undefined)}
								disabled={push.isPending}
							>
								{push.isPending ? (
									<Loader2 className="h-6 w-6 animate-spin mb-2" />
								) : (
									<ArrowUpFromLine className="h-6 w-6 mb-2" />
								)}
								<span className="font-medium">
									<T id="settings.gitops.export_push" />
								</span>
								<span className="text-xs text-muted-foreground mt-1">
									Export config and push to remote
								</span>
							</Button>

							<Button
								variant="outline"
								className="h-auto py-4 flex-col"
								onClick={() => pull.mutate()}
								disabled={pull.isPending}
							>
								{pull.isPending ? (
									<Loader2 className="h-6 w-6 animate-spin mb-2" />
								) : (
									<ArrowDownToLine className="h-6 w-6 mb-2" />
								)}
								<span className="font-medium">
									<T id="settings.gitops.pull_now" />
								</span>
								<span className="text-xs text-muted-foreground mt-1">Pull latest from remote</span>
							</Button>

							<Dialog>
								<DialogTrigger asChild>
									<Button
										variant="outline"
										className="h-auto py-4 flex-col border-amber-500/50 hover:border-amber-500"
									>
										<RotateCcw className="h-6 w-6 mb-2 text-amber-500" />
										<span className="font-medium">
											<T id="settings.gitops.import" />
										</span>
										<span className="text-xs text-muted-foreground mt-1">
											Import config from Git
										</span>
									</Button>
								</DialogTrigger>
								<DialogContent>
									<DialogHeader>
										<DialogTitle>Import Configuration from Git?</DialogTitle>
										<DialogDescription>
											The verified public snapshot contains proxy hosts, redirection hosts, 404
											hosts, and streams. Replacement removes active entries missing from the
											snapshot. Validate first without changing the database or Nginx runtime.
										</DialogDescription>
									</DialogHeader>
									<DialogFooter>
										<DialogClose asChild>
											<Button variant="outline">Cancel</Button>
										</DialogClose>
										<Button
											variant="outline"
											onClick={() => importConfig.mutate({ overwrite: true, dryRun: true })}
											disabled={importConfig.isPending}
										>
											Validate
										</Button>
										<Button
											onClick={() => importConfig.mutate({ overwrite: true, dryRun: false })}
											className="bg-amber-600 hover:bg-amber-700"
											disabled={importConfig.isPending}
										>
											Import & Replace
										</Button>
									</DialogFooter>
								</DialogContent>
							</Dialog>
						</div>
					</CardContent>
				</Card>
			)}

			{/* History Card */}
			{history && history.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-lg">
							<GitCommit className="h-5 w-5" />
							<T id="settings.gitops.history" />
						</CardTitle>
					</CardHeader>
					<CardContent>
						<ScrollArea className="h-[300px]">
							<div className="space-y-2">
								{history.map((commit, index) => (
									<div key={commit.sha}>
										<div className="flex items-center justify-between py-2">
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2">
													<Badge variant="outline" className="font-mono text-xs">
														{commit.sha.substring(0, 7)}
													</Badge>
													<span className="text-sm truncate">{commit.message}</span>
												</div>
												<div className="text-xs text-muted-foreground mt-1">
													{commit.author} • {new Date(commit.date).toLocaleString()}
												</div>
											</div>
											<Dialog
												open={openRevertId === commit.sha}
												onOpenChange={(open) => setOpenRevertId(open ? commit.sha : null)}
											>
												<DialogTrigger asChild>
													<Button variant="ghost" size="sm" className="ml-2">
														<RotateCcw className="h-4 w-4" />
													</Button>
												</DialogTrigger>
												<DialogContent>
													<DialogHeader>
														<DialogTitle>Revert to this commit?</DialogTitle>
														<DialogDescription>
															Revert to commit {commit.sha.substring(0, 7)}: "
															{commit.message}"
														</DialogDescription>
													</DialogHeader>
													<DialogFooter>
														<DialogClose asChild>
															<Button variant="outline">Cancel</Button>
														</DialogClose>
														<Button
															onClick={() =>
																revert.mutate(commit.sha, {
																	onSuccess: () => setOpenRevertId(null),
																})
															}
															className="bg-amber-600 hover:bg-amber-700"
															disabled={revert.isPending}
														>
															{revert.isPending && openRevertId === commit.sha && (
																<Loader2 className="mr-2 h-4 w-4 animate-spin" />
															)}
															Revert
														</Button>
													</DialogFooter>
												</DialogContent>
											</Dialog>
										</div>
										{index < history.length - 1 && <Separator />}
									</div>
								))}
							</div>
						</ScrollArea>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
