import { IconEye, IconShieldCheck, IconTags } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
	applyHostProfile,
	type BulkPreview,
	type BulkResult,
	getWorkspaceHosts,
	getWorkspaceItems,
	type HostView,
	previewHostProfile,
	removeWorkspaceItem,
	saveWorkspaceItem,
	setWorkspaceTags,
} from "src/api/backend/hostWorkspace";
import { HasPermission } from "src/components";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Checkbox } from "src/components/ui/checkbox";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { intl, T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";

const text = (id: string) => intl.formatMessage({ id: `workspace.${id}` });
const splitTags = (value: string) => [
	...new Set(
		value
			.split(",")
			.map((tag) => tag.trim().toLowerCase())
			.filter(Boolean),
	),
];
const boolFields = ["blockExploits", "securityCrowdsec", "sslForced", "http2Support", "hstsEnabled", "hstsSubdomains"];
const pretty = (value: unknown) => JSON.stringify(value ?? null);
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export default function HostWorkspace() {
	const qc = useQueryClient();
	const previewGeneration = useRef(0);
	const invalidatePreview = () => {
		previewGeneration.current++;
		setPreview(null);
	};
	const [filters, setFilters] = useState<HostView>({});
	const [page, setPage] = useState(1);
	const [filterTagsText, setFilterTagsText] = useState("");
	const [selected, setSelected] = useState<number[]>([]);
	const [tagText, setTagText] = useState("");
	const [name, setName] = useState("");
	const [profileName, setProfileName] = useState("");
	const [settings, setSettings] = useState<Record<string, unknown>>({});
	const [profileId, setProfileId] = useState("");
	const [preview, setPreview] = useState<BulkPreview | null>(null);
	const [result, setResult] = useState<BulkResult | null>(null);
	const [feedback, setFeedback] = useState("");
	const hosts = useQuery({
		queryKey: ["host-workspace", "hosts", filters, page],
		queryFn: ({ signal }) => getWorkspaceHosts(filters, page, signal),
	});
	const items = useQuery({
		queryKey: ["host-workspace", "items"],
		queryFn: ({ signal }) => getWorkspaceItems(signal),
	});
	const refresh = () => {
		void qc.invalidateQueries({ queryKey: ["host-workspace"] });
		void qc.invalidateQueries({ queryKey: ["proxy-hosts"] });
	};
	const mutate = useMutation({
		mutationFn: async (action: () => Promise<unknown>) => action(),
		onSuccess: () => refresh(),
	});
	const perform = async (action: () => Promise<unknown>) => {
		setFeedback("");
		try {
			await mutate.mutateAsync(action);
		} catch (error) {
			setFeedback(errorText(error));
		}
	};
	const changeFilters = (next: HostView) => {
		setFilters(next);
		setPage(1);
		invalidatePreview();
	};
	const changeSetting = (key: string, value: unknown) => {
		setSettings((current) => {
			const next = { ...current };
			if (value === undefined) delete next[key];
			else next[key] = value;
			return next;
		});
	};
	const toggle = (id: number) => {
		invalidatePreview();
		setSelected((current) =>
			current.includes(id)
				? current.filter((value) => value !== id)
				: current.length < 100
					? [...current, id]
					: current,
		);
	};
	const saveView = () =>
		perform(async () => {
			await saveWorkspaceItem({ kind: "view", name, definition: filters });
			setName("");
		});
	const saveProfile = () =>
		perform(async () => {
			const item = await saveWorkspaceItem({ kind: "profile", name: profileName, definition: { settings } });
			invalidatePreview();
			setProfileId(String(item.id));
			setProfileName("");
		});
	const profiles = items.data?.filter((item) => item.kind === "profile") ?? [];
	return (
		<div className="p-4 md:p-8 space-y-6">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h1 className="text-3xl font-bold flex items-center gap-2">
						<IconTags />
						{text("title")}
					</h1>
					<p className="text-muted-foreground">{text("description")}</p>
				</div>
				<Button asChild variant="outline">
					<Link to="/nginx/proxy">
						<T id="proxy-hosts" />
					</Link>
				</Button>
			</div>
			{(feedback || hosts.error || items.error) && (
				<Alert variant="destructive">
					<AlertDescription>{feedback || hosts.error?.message || items.error?.message}</AlertDescription>
				</Alert>
			)}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<IconEye />
						{text("views")}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
						<div>
							<Label htmlFor="workspace-search">{text("search")}</Label>
							<Input
								id="workspace-search"
								value={filters.query ?? ""}
								onChange={(event) => changeFilters({ ...filters, query: event.target.value })}
							/>
						</div>
						<div>
							<Label htmlFor="workspace-filter-tags">{text("tags")}</Label>
							<Input
								id="workspace-filter-tags"
								value={filterTagsText}
								onChange={(event) => {
									setFilterTagsText(event.target.value);
									changeFilters({ ...filters, tags: splitTags(event.target.value) });
								}}
							/>
						</div>
						<div>
							<Label htmlFor="workspace-monitor">{text("monitor")}</Label>
							<select
								id="workspace-monitor"
								className="w-full h-10 border rounded-md bg-background px-3"
								value={filters.monitor ?? ""}
								onChange={(event) =>
									changeFilters({ ...filters, monitor: event.target.value || undefined })
								}
							>
								<option value="">{text("any")}</option>
								{["up", "down", "unknown", "paused"].map((state) => (
									<option key={state} value={state}>
										{text(state)}
									</option>
								))}
							</select>
						</div>
						<div>
							<Label htmlFor="workspace-cert-days">{text("certificateDays")}</Label>
							<Input
								id="workspace-cert-days"
								type="number"
								min={0}
								max={365}
								value={filters.certificateDays ?? ""}
								onChange={(event) =>
									changeFilters({
										...filters,
										certificateDays:
											event.target.value === "" ? undefined : Number(event.target.value),
									})
								}
							/>
						</div>
					</div>
					<div className="flex flex-wrap items-end gap-2">
						<div>
							<Label htmlFor="workspace-enabled">{text("status")}</Label>
							<select
								id="workspace-enabled"
								className="h-10 border rounded-md bg-background px-3 block"
								value={filters.enabled === undefined ? "" : String(filters.enabled)}
								onChange={(event) =>
									changeFilters({
										...filters,
										enabled: event.target.value === "" ? undefined : event.target.value === "true",
									})
								}
							>
								<option value="">{text("any")}</option>
								<option value="true">{text("enabled")}</option>
								<option value="false">{text("disabled")}</option>
							</select>
						</div>
						<div>
							<Label htmlFor="workspace-view-name">{text("viewName")}</Label>
							<Input
								id="workspace-view-name"
								maxLength={80}
								value={name}
								onChange={(event) => setName(event.target.value)}
							/>
						</div>
						<Button disabled={!name.trim() || mutate.isPending} onClick={() => void saveView()}>
							{text("saveView")}
						</Button>
					</div>
					<div className="flex flex-wrap gap-2">
						{items.data
							?.filter((item) => item.kind === "view")
							.map((item) => (
								<div key={item.id} className="flex items-center rounded border">
									<Button
										variant="ghost"
										onClick={() => {
											setFilterTagsText(item.definition.tags?.join(", ") ?? "");
											changeFilters(item.definition);
										}}
									>
										{item.name}
									</Button>
									<Button
										variant="ghost"
										aria-label={`${text("delete")} ${item.name}`}
										onClick={() => void perform(() => removeWorkspaceItem(item))}
									>
										×
									</Button>
								</div>
							))}
					</div>
				</CardContent>
			</Card>
			<Card>
				<CardHeader>
					<CardTitle>
						{text("hosts")} ({hosts.data?.pagination.totalItems ?? 0})
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<p className="text-sm text-muted-foreground">
						{intl.formatMessage({ id: "workspace.selected" }, { count: selected.length })}
					</p>
					<div className="overflow-x-auto">
						<table className="w-full text-sm">
							<thead>
								<tr className="border-b">
									<th className="p-2 text-left">{text("select")}</th>
									<th className="p-2 text-left">{text("host")}</th>
									<th className="p-2 text-left">{text("tags")}</th>
									<th className="p-2 text-left">{text("status")}</th>
								</tr>
							</thead>
							<tbody>
								{hosts.data?.items.map((host) => (
									<tr key={host.id} className="border-b">
										<td className="p-2">
											<Checkbox
												aria-label={`${text("select")} ${host.domainNames[0]}`}
												checked={selected.includes(host.id)}
												onCheckedChange={() => toggle(host.id)}
											/>
										</td>
										<td className="p-2">{host.domainNames.join(", ")}</td>
										<td className="p-2">{host.tags.join(", ") || "—"}</td>
										<td className="p-2">{text(host.enabled ? "enabled" : "disabled")}</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
					{hosts.isPending ? (
						<p>{text("loading")}</p>
					) : !hosts.data?.items.length ? (
						<p>{text("empty")}</p>
					) : null}
					<div className="flex flex-wrap gap-2">
						<Button
							aria-label={text("previous")}
							variant="outline"
							disabled={page <= 1}
							onClick={() => setPage(page - 1)}
						>
							←
						</Button>
						<span className="self-center">
							{page} / {hosts.data?.pagination.totalPages || 1}
						</span>
						<Button
							aria-label={text("next")}
							variant="outline"
							disabled={page >= (hosts.data?.pagination.totalPages ?? 1)}
							onClick={() => setPage(page + 1)}
						>
							→
						</Button>
						<Button
							variant="outline"
							onClick={() => {
								setSelected([]);
								invalidatePreview();
							}}
						>
							{text("clearSelection")}
						</Button>
						<Button
							variant="outline"
							onClick={() => {
								setSelected((hosts.data?.items ?? []).map((host) => host.id));
								invalidatePreview();
							}}
						>
							{text("selectPage")}
						</Button>
					</div>
					<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
						<div className="flex flex-wrap items-end gap-2">
							<div>
								<Label htmlFor="workspace-tags">{text("replaceTags")}</Label>
								<Input
									id="workspace-tags"
									value={tagText}
									onChange={(event) => setTagText(event.target.value)}
								/>
							</div>
							<Button
								disabled={!selected.length || mutate.isPending}
								onClick={() =>
									void perform(async () => {
										const failed = [];
										for (const id of selected) {
											try {
												await setWorkspaceTags(id, splitTags(tagText));
											} catch (error) {
												failed.push(`${id}: ${errorText(error)}`);
											}
										}
										if (failed.length) setFeedback(failed.join("; "));
									})
								}
							>
								{text("applyTags")}
							</Button>
						</div>
					</HasPermission>
				</CardContent>
			</Card>
			<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<IconShieldCheck />
							{text("profiles")}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<p className="text-muted-foreground">{text("profileDescription")}</p>
						<div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
							{boolFields.map((field) => (
								<div key={field}>
									<Label htmlFor={`profile-${field}`}>{text(field)}</Label>
									<select
										id={`profile-${field}`}
										className="w-full h-10 border rounded-md bg-background px-3"
										value={settings[field] === undefined ? "" : String(settings[field])}
										onChange={(event) =>
											changeSetting(
												field,
												event.target.value === "" ? undefined : event.target.value === "true",
											)
										}
									>
										<option value="">{text("unchanged")}</option>
										<option value="true">{text("enabled")}</option>
										<option value="false">{text("disabled")}</option>
									</select>
								</div>
							))}
						</div>
						<div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
							{["advLimitReqRate", "advLimitReqBurst"].map((field) => (
								<div key={field}>
									<Label htmlFor={`profile-${field}`}>{text(field)}</Label>
									<Input
										id={`profile-${field}`}
										type="number"
										min={0}
										max={100000}
										value={settings[field] === undefined ? "" : String(settings[field])}
										onChange={(event) =>
											changeSetting(
												field,
												event.target.value === "" ? undefined : Number(event.target.value),
											)
										}
									/>
								</div>
							))}
							<div>
								<Label htmlFor="profile-unit">{text("unit")}</Label>
								<select
									id="profile-unit"
									className="w-full h-10 border rounded-md bg-background px-3"
									value={String(settings.advLimitReqUnit ?? "")}
									onChange={(event) =>
										changeSetting("advLimitReqUnit", event.target.value || undefined)
									}
								>
									<option value="">{text("unchanged")}</option>
									<option value="s">{text("second")}</option>
									<option value="m">{text("minute")}</option>
								</select>
							</div>
							<div>
								<Label htmlFor="profile-bandwidth">{text("bandwidth")}</Label>
								<Input
									id="profile-bandwidth"
									value={String(settings.bandwidthLimit ?? "")}
									onChange={(event) =>
										changeSetting("bandwidthLimit", event.target.value || undefined)
									}
								/>
							</div>
						</div>
						<div className="flex items-end gap-2">
							<div>
								<Label htmlFor="workspace-profile-name">{text("profileName")}</Label>
								<Input
									id="workspace-profile-name"
									maxLength={80}
									value={profileName}
									onChange={(event) => setProfileName(event.target.value)}
								/>
							</div>
							<Button
								disabled={!profileName.trim() || !Object.keys(settings).length || mutate.isPending}
								onClick={() => void saveProfile()}
							>
								{text("saveProfile")}
							</Button>
						</div>
						<div className="flex flex-wrap items-end gap-2">
							<div>
								<Label htmlFor="workspace-profile">{text("chooseProfile")}</Label>
								<select
									id="workspace-profile"
									className="h-10 border rounded-md bg-background px-3 block"
									value={profileId}
									onChange={(event) => {
										setProfileId(event.target.value);
										invalidatePreview();
										setResult(null);
									}}
								>
									<option value="">{text("select")}</option>
									{profiles.map((item) => (
										<option key={item.id} value={item.id}>
											{item.name}
										</option>
									))}
								</select>
							</div>
							<Button
								disabled={!profileId || !selected.length || mutate.isPending}
								onClick={() =>
									void perform(async () => {
										setResult(null);
										const generation = ++previewGeneration.current;
										const next = await previewHostProfile(Number(profileId), selected);
										if (generation === previewGeneration.current) setPreview(next);
									})
								}
							>
								{text("preview")}
							</Button>
							{profileId && (
								<Button
									variant="outline"
									disabled={mutate.isPending}
									onClick={() =>
										void perform(async () => {
											const item = profiles.find((value) => value.id === Number(profileId));
											if (item) await removeWorkspaceItem(item);
											setProfileId("");
											invalidatePreview();
										})
									}
								>
									{text("deleteProfile")}
								</Button>
							)}
						</div>
						{preview && (
							<div className="border rounded-lg p-4 space-y-3">
								<h3 className="font-semibold">{text("previewTitle")}</h3>
								{preview.results.map((row) => (
									<div key={row.id} className="border-b pb-2">
										<p className="font-medium">
											#{row.id} {row.error}
										</p>
										{row.ready && (
											<dl className="grid sm:grid-cols-2 gap-1 text-sm">
												{Object.keys(row.after ?? {}).map((field) => (
													<div key={field}>
														{text(field)}: {pretty(row.before?.[field])} →{" "}
														{pretty(row.after?.[field])}
													</div>
												))}
											</dl>
										)}
									</div>
								))}
								<Button
									disabled={!preview.plan || mutate.isPending}
									onClick={() =>
										void perform(async () => {
											if (preview.plan) {
												setResult(await applyHostProfile(preview.plan));
												invalidatePreview();
											}
										})
									}
								>
									{text("activate")}
								</Button>
								<p className="text-sm text-muted-foreground">{text("stalePlan")}</p>
							</div>
						)}
						{result && (
							<Alert>
								<AlertDescription>
									{result.results.map((row) => (
										<p key={row.id}>
											#{row.id}: {row.success ? text("applied") : row.error}
										</p>
									))}
								</AlertDescription>
							</Alert>
						)}
					</CardContent>
				</Card>
			</HasPermission>
		</div>
	);
}
