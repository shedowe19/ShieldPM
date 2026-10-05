import {
	AlertCircle,
	Database,
	Download,
	Edit2,
	FileText,
	Globe,
	Loader2,
	Plus,
	ShieldBan,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { FirewallList } from "src/api/backend/firewallLists";
import { HasPermission } from "src/components/HasPermission";
import { LoadingPage } from "src/components/LoadingPage";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/components/ui/table";
import { useDeleteFirewallList, useFirewallLists, useRefreshFirewallList } from "src/hooks/useFirewallLists";
import { formatDateTime, intl, T } from "src/locale";
import type { FirewallPreset } from "src/modals/FirewallListModal";
import { ACCESS_LISTS, MANAGE, PROXY_HOSTS, VIEW } from "src/modules/Permissions";
import { showSuccess } from "src/notifications";
import { showDeleteConfirmModal, showFirewallListModal } from "./Firewall.lazy";

function PresetCard({ preset }: { preset: FirewallPreset }) {
	return (
		<div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4">
			<div className="flex items-center gap-2 font-medium">
				{preset === "vpn" ? (
					<Globe className="h-4 w-4 text-cyan-500" />
				) : (
					<Database className="h-4 w-4 text-cyan-500" />
				)}
				<T id={`firewall.preset.${preset}.title`} />
			</div>
			<p className="flex-1 text-sm text-muted-foreground">
				<T id={`firewall.preset.${preset}.help`} />
			</p>
			<HasPermission section={ACCESS_LISTS} permission={MANAGE} hideError>
				<Button
					size="sm"
					variant="outline"
					className="self-start"
					onClick={() => showFirewallListModal(undefined, preset)}
				>
					<Plus className="mr-2 h-4 w-4" />
					<T id="firewall.preset.add" />
				</Button>
			</HasPermission>
		</div>
	);
}

function FirewallContent() {
	const query = useFirewallLists();
	const refresh = useRefreshFirewallList();
	const remove = useDeleteFirewallList();
	const [search, setSearch] = useState("");
	const [actionError, setActionError] = useState<string | null>(null);
	const lists = query.data ?? [];
	const searchValue = search.trim().toLowerCase();
	const filtered = lists.filter((item) =>
		`${item.name} ${item.reason} ${item.sourceUrl}`.toLowerCase().includes(searchValue),
	);
	const refreshList = async (id: number) => {
		setActionError(null);
		try {
			await refresh.mutateAsync(id);
			showSuccess(intl.formatMessage({ id: "firewall.refreshed" }));
		} catch (error) {
			setActionError(error instanceof Error ? error.message : intl.formatMessage({ id: "error.unknown" }));
		}
	};
	const deleteList = (item: FirewallList) =>
		showDeleteConfirmModal({
			title: <T id="firewall.delete" />,
			children: <T id="firewall.delete.help" data={{ name: item.name }} />,
			onConfirm: () => remove.mutateAsync(item.id),
		});

	return (
		<div className="mt-4 space-y-6">
			<Card className="border-t-4 border-cyan-500/50">
				<CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="space-y-2">
						<CardTitle className="flex items-center gap-2 text-2xl">
							<ShieldBan className="h-6 w-6" />
							<T id="firewall.title" />
						</CardTitle>
						<CardDescription className="max-w-2xl">
							<T id="firewall.intro" />
						</CardDescription>
					</div>
					<HasPermission section={ACCESS_LISTS} permission={MANAGE} hideError>
						<Button
							className="bg-cyan-600 hover:bg-cyan-700 text-white shrink-0"
							onClick={() => showFirewallListModal()}
						>
							<Plus className="mr-2 h-4 w-4" />
							<T id="firewall.add" />
						</Button>
					</HasPermission>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
						<p>
							<T id="firewall.hostHint" />
						</p>
						<HasPermission section={PROXY_HOSTS} permission={VIEW} hideError>
							<Button asChild variant="outline" size="sm">
								<Link to="/nginx/proxy">
									<T id="proxy-hosts" />
								</Link>
							</Button>
						</HasPermission>
					</div>
					<div className="grid gap-3 sm:grid-cols-2">
						<PresetCard preset="vpn" />
						<PresetCard preset="datacenter" />
					</div>
					<p className="text-xs text-muted-foreground">
						<T id="firewall.listAccuracy" />
					</p>
				</CardContent>
			</Card>
			<Card>
				<CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
					<CardTitle className="text-lg">
						<T id="firewall.lists" />
					</CardTitle>
					<Input
						className="sm:max-w-xs"
						type="search"
						value={search}
						onChange={(event) => setSearch(event.target.value)}
						aria-label={intl.formatMessage({ id: "firewall.search" })}
						placeholder={intl.formatMessage({ id: "search.placeholder" })}
					/>
				</CardHeader>
				<CardContent>
					{query.isPending ? (
						<LoadingPage noLogo />
					) : query.error ? (
						<Alert variant="destructive">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{query.error.message}</AlertDescription>
						</Alert>
					) : filtered.length === 0 ? (
						<div className="flex flex-col items-center gap-3 py-10 text-center">
							<ShieldBan className="h-10 w-10 text-muted-foreground" />
							<p className="font-medium">
								<T id={searchValue ? "firewall.noResults" : "firewall.empty"} />
							</p>
							{!searchValue && (
								<p className="max-w-md text-sm text-muted-foreground">
									<T id="firewall.empty.help" />
								</p>
							)}
						</div>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>
										<T id="column.name" />
									</TableHead>
									<TableHead>
										<T id="firewall.entryCount" />
									</TableHead>
									<TableHead>
										<T id="firewall.source" />
									</TableHead>
									<TableHead>
										<T id="firewall.lastUpdated" />
									</TableHead>
									<TableHead>
										<T id="firewall.status" />
									</TableHead>
									<TableHead className="text-right">
										<T id="firewall.actions" />
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{filtered.map((item) => (
									<TableRow key={item.id}>
										<TableCell className="min-w-48 max-w-sm">
											<div className="font-medium break-words">{item.name}</div>
											<div className="mt-1 text-xs text-muted-foreground break-words">
												{item.reason}
											</div>
										</TableCell>
										<TableCell className="tabular-nums">
											{item.entryCount.toLocaleString()}
										</TableCell>
										<TableCell>
											<div className="flex items-center gap-2 text-sm">
												{item.sourceType === "url" ? (
													<Globe className="h-4 w-4 shrink-0" />
												) : (
													<FileText className="h-4 w-4 shrink-0" />
												)}
												<T id={`firewall.source.${item.sourceType}`} />
											</div>
											{item.sourceType === "url" && (
												<div className="mt-1 text-xs text-muted-foreground">
													<T
														id="firewall.everyHours"
														data={{ hours: item.updateIntervalHours }}
													/>
												</div>
											)}
										</TableCell>
										<TableCell className="max-w-xs text-xs text-muted-foreground">
											{item.lastUpdatedOn ? (
												formatDateTime(item.lastUpdatedOn)
											) : (
												<T id="firewall.neverUpdated" />
											)}
											{item.lastError && (
												<p className="mt-1 text-destructive break-words">{item.lastError}</p>
											)}
										</TableCell>
										<TableCell>
											<Badge variant={item.enabled ? "default" : "secondary"}>
												<T id={item.enabled ? "firewall.enabled" : "firewall.disabled"} />
											</Badge>
										</TableCell>
										<TableCell>
											<HasPermission section={ACCESS_LISTS} permission={MANAGE} hideError>
												<div className="flex justify-end gap-1">
													{item.sourceType === "url" && (
														<Button
															variant="ghost"
															size="icon"
															disabled={refresh.isPending || remove.isPending}
															onClick={() => refreshList(item.id)}
															aria-label={intl.formatMessage(
																{ id: "firewall.refresh" },
																{ name: item.name },
															)}
														>
															{refresh.isPending && refresh.variables === item.id ? (
																<Loader2 className="h-4 w-4 animate-spin" />
															) : (
																<Download className="h-4 w-4" />
															)}
														</Button>
													)}
													<Button
														variant="ghost"
														size="icon"
														disabled={refresh.isPending || remove.isPending}
														onClick={() => showFirewallListModal(item.id)}
														aria-label={intl.formatMessage(
															{ id: "firewall.editNamed" },
															{ name: item.name },
														)}
													>
														<Edit2 className="h-4 w-4" />
													</Button>
													<Button
														variant="ghost"
														size="icon"
														disabled={refresh.isPending || remove.isPending}
														onClick={() => deleteList(item)}
														aria-label={intl.formatMessage(
															{ id: "firewall.deleteNamed" },
															{ name: item.name },
														)}
													>
														<Trash2 className="h-4 w-4 text-destructive" />
													</Button>
												</div>
											</HasPermission>
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
					{actionError && (
						<Alert variant="destructive" className="mt-4">
							<AlertDescription>{actionError}</AlertDescription>
						</Alert>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

export default function Firewall() {
	return (
		<HasPermission section={ACCESS_LISTS} permission={VIEW} pageLoading loadingNoLogo>
			<FirewallContent />
		</HasPermission>
	);
}
