import { Activity, Bell, BellOff, Plus, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
	IncidentHost,
	LatencyBucket,
	NotificationTarget,
	NotificationTargetInput,
} from "src/api/backend/incidents";
import { HasPermission } from "src/components/HasPermission";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { Checkbox } from "src/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/components/ui/table";
import { useIncidentActions, useIncidentCenter } from "src/hooks/useIncidents";
import { intl } from "src/locale";
import { MANAGE, PROXY_HOSTS, VIEW } from "src/modules/Permissions";

const label = (key: string) => intl.formatMessage({ id: `incidents.${key}` });
const when = (value: string | null) => (value ? new Date(value).toLocaleString() : "—");
const duration = (value: number) => {
	const seconds = Math.max(0, Math.floor(value / 1000));
	return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m ${seconds % 60}s`;
};
const localInput = (value: string) => {
	const date = new Date(value);
	return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const hostName = (host?: IncidentHost) => host?.domainNames.join(", ") || `#${host?.id || "?"}`;

export function LatencyChart({ data }: { data: LatencyBucket[] }) {
	const paths = useMemo(() => {
		if (!data.length) return [];
		const start = Date.parse(data[0].bucket);
		const span = Math.max(60_000, Date.parse(data[data.length - 1].bucket) - start);
		const maximum = Math.max(1, ...data.map((row) => row.maxMs));
		const groups: string[][] = [];
		let previous = 0;
		for (const row of data) {
			const time = Date.parse(row.bucket);
			if (!groups.length || time - previous > 120_000) groups.push([]);
			groups[groups.length - 1].push(
				`${10 + ((time - start) / span) * 780},${110 - (row.avgMs / maximum) * 100}`,
			);
			previous = time;
		}
		return groups.map((points) => points.join(" "));
	}, [data]);
	if (!data.length) return <p className="text-sm text-muted-foreground">{label("noLatency")}</p>;
	return (
		<div>
			<svg viewBox="0 0 800 125" className="h-36 w-full text-primary" role="img" aria-label={label("latency")}>
				<title>{label("latency")}</title>
				<desc>{label("latencyHelp")}</desc>
				{paths.map((points) => (
					<polyline key={points} points={points} fill="none" stroke="currentColor" strokeWidth="2" />
				))}
			</svg>
			<div className="flex justify-between text-xs text-muted-foreground">
				<span>{when(data[0].bucket)}</span>
				<span>{Math.max(...data.map((row) => row.maxMs))} ms</span>
				<span>{when(data[data.length - 1].bucket)}</span>
			</div>
		</div>
	);
}

function TargetDialog({
	target,
	hosts,
	onClose,
}: {
	target: NotificationTarget | "new";
	hosts: IncidentHost[];
	onClose: () => void;
}) {
	const current = target === "new" ? undefined : target;
	const actions = useIncidentActions();
	const [name, setName] = useState(current?.name || "");
	const [type, setType] = useState<NotificationTarget["type"]>(current?.type || "webhook");
	const [enabled, setEnabled] = useState(current?.enabled ?? true);
	const [hostIds, setHostIds] = useState<number[]>(current?.hostIds || []);
	const [url, setUrl] = useState("");
	const [token, setToken] = useState("");
	const [tokenEdited, setTokenEdited] = useState(false);
	const submit = (event: React.FormEvent) => {
		event.preventDefault();
		const data: NotificationTargetInput = {
			name: name.trim(),
			type,
			enabled,
			hostIds,
			...(url ? { url } : {}),
			...(tokenEdited ? { token } : {}),
			...(current ? { version: current.version } : {}),
		};
		actions.saveTarget.mutate({ id: current?.id, data }, { onSuccess: onClose });
	};
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="max-h-[90dvh] overflow-auto">
				<DialogHeader>
					<DialogTitle>{label(current ? "editTarget" : "newTarget")}</DialogTitle>
					<DialogDescription>{label("targetHelp")}</DialogDescription>
				</DialogHeader>
				<form onSubmit={submit} className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="incident-target-name">{label("name")}</Label>
						<Input
							id="incident-target-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							required
							maxLength={100}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="incident-target-type">{label("type")}</Label>
						<Select value={type} onValueChange={(value) => setType(value as NotificationTarget["type"])}>
							<SelectTrigger id="incident-target-type">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="webhook">Webhook</SelectItem>
								<SelectItem value="ntfy">ntfy</SelectItem>
								<SelectItem value="discord">Discord</SelectItem>
							</SelectContent>
						</Select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="incident-target-url">{label("endpoint")}</Label>
						<Input
							id="incident-target-url"
							type="url"
							autoComplete="off"
							value={url}
							onChange={(event) => setUrl(event.target.value)}
							required={!current || type !== current.type}
							maxLength={2048}
							placeholder="https://…"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="incident-target-token">{label("token")}</Label>
						<Input
							id="incident-target-token"
							type="password"
							autoComplete="new-password"
							value={token}
							onChange={(event) => {
								setTokenEdited(true);
								setToken(event.target.value);
							}}
							maxLength={4096}
						/>
					</div>
					<label htmlFor="incident-target-enabled" className="flex items-center gap-2">
						<Checkbox
							id="incident-target-enabled"
							checked={enabled}
							onCheckedChange={(value) => setEnabled(value === true)}
						/>
						{label("enabled")}
					</label>
					<fieldset className="space-y-2 rounded-md border p-3">
						<legend className="px-1 text-sm">{label("selectedHosts")}</legend>
						<label htmlFor="incident-target-all" className="flex items-center gap-2">
							<Checkbox
								id="incident-target-all"
								checked={!hostIds.length}
								onCheckedChange={() => setHostIds([])}
							/>
							{label("allOwnedHosts")}
						</label>
						<div className="max-h-36 space-y-2 overflow-auto">
							{hosts
								.filter((host) => host.owned)
								.map((host) => (
									<label
										key={host.id}
										htmlFor={`incident-target-host-${host.id}`}
										className="flex items-center gap-2 text-sm"
									>
										<Checkbox
											id={`incident-target-host-${host.id}`}
											checked={hostIds.includes(host.id)}
											onCheckedChange={(value) =>
												setHostIds((ids) =>
													value ? [...ids, host.id] : ids.filter((id) => id !== host.id),
												)
											}
										/>
										{hostName(host)}
									</label>
								))}
						</div>
					</fieldset>
					{actions.saveTarget.error && (
						<Alert variant="destructive">
							<AlertDescription>{actions.saveTarget.error.message}</AlertDescription>
						</Alert>
					)}
					<div className="flex justify-end gap-2">
						<Button type="button" variant="outline" onClick={onClose}>
							{label("cancel")}
						</Button>
						<Button disabled={actions.saveTarget.isPending || !name.trim()}>{label("save")}</Button>
					</div>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function IncidentCenterContent() {
	const [hostId, setHostId] = useState<number>();
	const [status, setStatus] = useState("all");
	const [days, setDays] = useState(30);
	const [before, setBefore] = useState<number>();
	const [editing, setEditing] = useState<NotificationTarget | "new" | null>(null);
	const [muteStart, setMuteStart] = useState(localInput(new Date().toISOString()));
	const [muteEnd, setMuteEnd] = useState(localInput(new Date(Date.now() + 3_600_000).toISOString()));
	const [reason, setReason] = useState("");
	const [muteError, setMuteError] = useState("");
	const queries = useIncidentCenter(hostId, status, days, before);
	const actions = useIncidentActions();
	const hosts = queries.hosts.data || [];
	const byHost = new Map(hosts.map((host) => [host.id, host]));
	const detail = queries.detail.data;
	const muteKey = JSON.stringify({ hostId, mute: detail?.mute });
	useEffect(() => {
		const { mute } = JSON.parse(muteKey);
		if (mute) {
			setMuteStart(localInput(mute.startsAt));
			setMuteEnd(localInput(mute.endsAt));
			setReason(mute.reason);
		} else {
			setMuteStart(localInput(new Date().toISOString()));
			setMuteEnd(localInput(new Date(Date.now() + 3_600_000).toISOString()));
			setReason("");
		}
	}, [muteKey]);
	const error =
		queries.hosts.error ||
		queries.incidents.error ||
		queries.detail.error ||
		queries.targets.error ||
		queries.deliveries.error ||
		actions.deleteTarget.error ||
		actions.retry.error ||
		actions.mute.error;
	return (
		<div className="space-y-6 p-4 md:p-6">
			<header className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="flex items-center gap-2 text-2xl font-semibold">
						<Activity className="h-6 w-6" />
						{label("title")}
					</h1>
					<p className="text-sm text-muted-foreground">{label("description")}</p>
				</div>
				<Button
					variant="outline"
					onClick={() => {
						void queries.incidents.refetch();
						if (hostId) void queries.detail.refetch();
						void queries.deliveries.refetch();
					}}
				>
					<RefreshCw className="mr-2 h-4 w-4" />
					{label("refresh")}
				</Button>
			</header>
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error.message || label("error")}</AlertDescription>
				</Alert>
			)}
			<div className="flex flex-wrap gap-3">
				<Select
					value={hostId ? String(hostId) : "all"}
					onValueChange={(value) => {
						setHostId(value === "all" ? undefined : Number(value));
						setBefore(undefined);
					}}
				>
					<SelectTrigger className="w-72" aria-label={label("host")}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{label("allHosts")}</SelectItem>
						{hosts.map((host) => (
							<SelectItem key={host.id} value={String(host.id)}>
								{hostName(host)}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
				<Select
					value={status}
					onValueChange={(value) => {
						setStatus(value);
						setBefore(undefined);
					}}
				>
					<SelectTrigger className="w-48" aria-label={label("timeline")}>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">{label("allStates")}</SelectItem>
						<SelectItem value="open">{label("open")}</SelectItem>
						<SelectItem value="resolved">{label("resolved")}</SelectItem>
					</SelectContent>
				</Select>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>{label("timeline")}</CardTitle>
				</CardHeader>
				<CardContent>
					{queries.incidents.isLoading ? (
						<p>{label("loading")}</p>
					) : !queries.incidents.data?.length ? (
						<p className="text-sm text-muted-foreground">{label("noIncidents")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{label("host")}</TableHead>
									<TableHead>{label("opened")}</TableHead>
									<TableHead>{label("duration")}</TableHead>
									<TableHead>{label("checks")}</TableHead>
									<TableHead>{label("reason")}</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{queries.incidents.data.map((incident) => (
									<TableRow key={incident.id}>
										<TableCell>
											<Button
												variant="link"
												className="h-auto p-0"
												onClick={() => {
													setHostId(incident.hostId);
													setBefore(undefined);
												}}
											>
												{hostName(byHost.get(incident.hostId))}
											</Button>
											<div>
												<Badge variant={incident.resolvedAt ? "secondary" : "destructive"}>
													{label(
														incident.resolvedAt
															? incident.resolution === "monitor_changed"
																? "monitorChanged"
																: "resolved"
															: "open",
													)}
												</Badge>
											</div>
										</TableCell>
										<TableCell>{when(incident.openedAt)}</TableCell>
										<TableCell>
											{duration(
												Date.parse(incident.resolvedAt || new Date().toISOString()) -
													Date.parse(incident.openedAt),
											)}
										</TableCell>
										<TableCell>{incident.failureCount}</TableCell>
										<TableCell>{incident.message}</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
					<div className="mt-3 flex justify-end gap-2">
						{before && (
							<Button variant="outline" onClick={() => setBefore(undefined)}>
								{label("latest")}
							</Button>
						)}
						{queries.incidents.data?.length === 100 && (
							<Button
								variant="outline"
								onClick={() =>
									setBefore(queries.incidents.data?.[queries.incidents.data.length - 1]?.id)
								}
							>
								{label("older")}
							</Button>
						)}
					</div>
				</CardContent>
			</Card>
			{!hostId ? (
				<p className="text-sm text-muted-foreground">{label("selectHost")}</p>
			) : (
				<>
					<Card>
						<CardHeader>
							<div className="flex items-center justify-between gap-3">
								<CardTitle>{label("availability")}</CardTitle>
								<Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
									<SelectTrigger className="w-32" aria-label={label("days")}>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										{[7, 30, 90, 365].map((day) => (
											<SelectItem key={day} value={String(day)}>
												{day} {label("days")}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
							<CardDescription>{label("availabilityHelp")}</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="max-h-80 overflow-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>{label("day")}</TableHead>
											<TableHead>{label("uptime")}</TableHead>
											<TableHead>{label("coverage")}</TableHead>
											<TableHead>{label("down")}</TableHead>
											<TableHead>{label("unknown")}</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{detail?.daily.map((day) => (
											<TableRow key={day.day}>
												<TableCell>{day.day}</TableCell>
												<TableCell>
													{day.uptimePercent === null
														? "—"
														: `${day.uptimePercent.toFixed(2)}%`}
												</TableCell>
												<TableCell>{day.coveragePercent.toFixed(2)}%</TableCell>
												<TableCell>{duration(day.downMs)}</TableCell>
												<TableCell>{duration(day.unknownMs)}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>{label("latency")}</CardTitle>
							<CardDescription>{label("latencyHelp")}</CardDescription>
						</CardHeader>
						<CardContent>
							<LatencyChart data={detail?.latency || []} />
						</CardContent>
					</Card>
					<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
						<Card>
							<CardHeader>
								<CardTitle className="flex items-center gap-2">
									<BellOff className="h-4 w-4" />
									{label("alarmMute")}
								</CardTitle>
								<CardDescription>{label("muteHelp")}</CardDescription>
							</CardHeader>
							<CardContent>
								{detail?.mute && (
									<p className="mb-3 text-sm">
										{when(detail.mute.startsAt)} → {when(detail.mute.endsAt)} · {detail.mute.reason}
									</p>
								)}
								<form
									className="grid gap-3 sm:grid-cols-2"
									onSubmit={(event) => {
										event.preventDefault();
										setMuteError("");
										const starts = new Date(muteStart);
										const ends = new Date(muteEnd);
										if (
											!hostId ||
											!Number.isFinite(starts.getTime()) ||
											!Number.isFinite(ends.getTime()) ||
											ends <= starts
										) {
											setMuteError(label("error"));
											return;
										}
										actions.mute.mutate({
											hostId,
											mute: {
												startsAt: starts.toISOString(),
												endsAt: ends.toISOString(),
												reason,
											},
										});
									}}
								>
									<div className="space-y-1">
										<Label htmlFor="incident-mute-start">{label("start")}</Label>
										<Input
											id="incident-mute-start"
											type="datetime-local"
											value={muteStart}
											onChange={(event) => setMuteStart(event.target.value)}
											required
										/>
									</div>
									<div className="space-y-1">
										<Label htmlFor="incident-mute-end">{label("end")}</Label>
										<Input
											id="incident-mute-end"
											type="datetime-local"
											value={muteEnd}
											onChange={(event) => setMuteEnd(event.target.value)}
											required
										/>
									</div>
									<div className="space-y-1 sm:col-span-2">
										<Label htmlFor="incident-mute-reason">{label("reason")}</Label>
										<Input
											id="incident-mute-reason"
											value={reason}
											onChange={(event) => setReason(event.target.value)}
											maxLength={255}
										/>
									</div>
									<div className="flex gap-2 sm:col-span-2">
										<Button disabled={actions.mute.isPending}>{label("save")}</Button>
										{detail?.mute && (
											<Button
												type="button"
												variant="outline"
												disabled={actions.mute.isPending}
												onClick={() => actions.mute.mutate({ hostId, mute: null })}
											>
												{label("clearMute")}
											</Button>
										)}
									</div>
									{muteError && <p role="alert">{muteError}</p>}
								</form>
							</CardContent>
						</Card>
					</HasPermission>
				</>
			)}
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between gap-2">
						<CardTitle className="flex items-center gap-2">
							<Bell className="h-4 w-4" />
							{label("targets")}
						</CardTitle>
						<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
							<Button onClick={() => setEditing("new")}>
								<Plus className="mr-2 h-4 w-4" />
								{label("newTarget")}
							</Button>
						</HasPermission>
					</div>
				</CardHeader>
				<CardContent>
					{!queries.targets.data?.length ? (
						<p className="text-sm text-muted-foreground">{label("noTargets")}</p>
					) : (
						<div className="space-y-3">
							{queries.targets.data.map((target) => (
								<div
									key={target.id}
									className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3"
								>
									<div className="space-x-2">
										<strong>{target.name}</strong>
										<Badge variant="secondary">{target.type}</Badge>
										<span className="text-xs text-muted-foreground">
											{target.hostIds.length
												? target.hostIds.map((id) => hostName(byHost.get(id))).join(", ")
												: label("allOwnedHosts")}
										</span>
										{!target.enabled && <Badge>{label("paused")}</Badge>}
									</div>
									<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
										<div className="flex gap-2">
											<Button size="sm" variant="outline" onClick={() => setEditing(target)}>
												{label("edit")}
											</Button>
											<Button
												size="sm"
												variant="destructive"
												disabled={actions.deleteTarget.isPending}
												onClick={() => {
													if (confirm(label("deleteTarget")))
														actions.deleteTarget.mutate(target.id);
												}}
											>
												{label("delete")}
											</Button>
										</div>
									</HasPermission>
								</div>
							))}
						</div>
					)}
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>{label("deliveries")}</CardTitle>
					<CardDescription>{label("deliveryHelp")}</CardDescription>
				</CardHeader>
				<CardContent>
					{!queries.deliveries.data?.length ? (
						<p className="text-sm text-muted-foreground">{label("noDeliveries")}</p>
					) : (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>{label("targets")}</TableHead>
									<TableHead>{label("host")}</TableHead>
									<TableHead>{label("opened")}</TableHead>
									<TableHead>{label("attempts")}</TableHead>
									<TableHead>{label("nextAttempt")}</TableHead>
									<TableHead>{label("reason")}</TableHead>
									<TableHead />
								</TableRow>
							</TableHeader>
							<TableBody>
								{queries.deliveries.data.map((delivery) => (
									<TableRow key={delivery.id}>
										<TableCell>
											{delivery.targetName}
											<div>
												<Badge
													variant={delivery.status === "failed" ? "destructive" : "secondary"}
												>
													{label(delivery.status)}
												</Badge>
											</div>
										</TableCell>
										<TableCell>{hostName(byHost.get(delivery.hostId))}</TableCell>
										<TableCell>{when(delivery.createdOn)}</TableCell>
										<TableCell>{delivery.attempts}/5</TableCell>
										<TableCell>
											{delivery.status === "pending" ? when(delivery.nextAttemptAt) : "—"}
										</TableCell>
										<TableCell>{delivery.lastError}</TableCell>
										<TableCell>
											{!["sent", "sending", "cancelled"].includes(delivery.status) && (
												<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
													<Button
														size="sm"
														variant="outline"
														disabled={actions.retry.isPending}
														onClick={() => actions.retry.mutate(delivery.id)}
													>
														{label("retry")}
													</Button>
												</HasPermission>
											)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					)}
				</CardContent>
			</Card>
			{editing && (
				<TargetDialog
					key={editing === "new" ? "new" : editing.id}
					target={editing}
					hosts={hosts}
					onClose={() => setEditing(null)}
				/>
			)}
		</div>
	);
}
export default function IncidentCenter() {
	return (
		<HasPermission section={PROXY_HOSTS} permission={VIEW} pageLoading loadingNoLogo>
			<IncidentCenterContent />
		</HasPermission>
	);
}
