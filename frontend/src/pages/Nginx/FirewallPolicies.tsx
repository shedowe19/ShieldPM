import { IconEdit, IconPlus, IconRefresh, IconShieldLock, IconTrash } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import {
	createFirewallPolicy,
	deleteFirewallPolicy,
	type FirewallPolicy,
	refreshFirewallPolicy,
	updateFirewallPolicy,
} from "src/api/backend";
import { HasPermission } from "src/components/HasPermission";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Switch } from "src/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "src/components/ui/table";
import { Textarea } from "src/components/ui/textarea";
import { useFirewallPolicies } from "src/hooks";
import { intl, T } from "src/locale";
import { ADMIN, MANAGE } from "src/modules/Permissions";

const X4B_VPN_FEED = "https://raw.githubusercontent.com/X4BNet/lists_vpn/main/output/vpn/ipv4.txt";

type PolicyDraft = {
	name: string;
	enabled: boolean;
	action: FirewallPolicy["action"];
	geoMode: FirewallPolicy["geoMode"];
	geoCountries: string;
	allowCidrs: string;
	blockCidrs: string;
	feedUrls: string;
	refreshIntervalHours: number;
};

const emptyDraft = (): PolicyDraft => ({
	name: "",
	enabled: true,
	action: "deny",
	geoMode: "off",
	geoCountries: "",
	allowCidrs: "",
	blockCidrs: "",
	feedUrls: "",
	refreshIntervalHours: 24,
});

const createDraft = (policy?: FirewallPolicy): PolicyDraft =>
	policy
		? {
				name: policy.name,
				enabled: policy.enabled,
				action: policy.action,
				geoMode: policy.geoMode,
				geoCountries: policy.geoCountries.join(", "),
				allowCidrs: policy.allowCidrs.join("\n"),
				blockCidrs: policy.blockCidrs.join("\n"),
				feedUrls: policy.feedUrls.join("\n"),
				refreshIntervalHours: policy.refreshIntervalHours,
			}
		: emptyDraft();

export const commaSeparatedLines = (value: string) =>
	value
		.split(/[\n,]/)
		.map((item) => item.trim())
		.filter(Boolean);

export const newlineSeparatedLines = (value: string) =>
	value
		.split(/\r?\n/)
		.map((item) => item.trim())
		.filter(Boolean);

function FirewallPoliciesContent() {
	const queryClient = useQueryClient();
	const { data = [], isLoading, error } = useFirewallPolicies();
	const [selected, setSelected] = useState<FirewallPolicy | null>(null);
	const [draft, setDraft] = useState<PolicyDraft>(emptyDraft);
	const [open, setOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);
	const [refreshingId, setRefreshingId] = useState<number | null>(null);

	const invalidate = async () => queryClient.invalidateQueries({ queryKey: ["firewall-policies"] });
	const startEdit = (policy?: FirewallPolicy) => {
		setSelected(policy || null);
		setDraft(createDraft(policy));
		setFormError(null);
		setOpen(true);
	};

	const save = async () => {
		setSaving(true);
		setFormError(null);
		const payload: Partial<FirewallPolicy> = {
			name: draft.name,
			enabled: draft.enabled,
			action: draft.action,
			geoMode: draft.geoMode,
			geoCountries: commaSeparatedLines(draft.geoCountries).map((country) => country.toUpperCase()),
			allowCidrs: commaSeparatedLines(draft.allowCidrs),
			blockCidrs: commaSeparatedLines(draft.blockCidrs),
			feedUrls: newlineSeparatedLines(draft.feedUrls),
			refreshIntervalHours: Number(draft.refreshIntervalHours),
		};
		try {
			if (selected) await updateFirewallPolicy(selected.id, payload);
			else await createFirewallPolicy(payload);
			await invalidate();
			setOpen(false);
		} catch (saveError) {
			setFormError(saveError instanceof Error ? saveError.message : String(saveError));
		} finally {
			setSaving(false);
		}
	};

	const refresh = async (policy: FirewallPolicy) => {
		setRefreshingId(policy.id);
		try {
			await refreshFirewallPolicy(policy.id);
			await invalidate();
		} finally {
			setRefreshingId(null);
		}
	};

	const remove = async (policy: FirewallPolicy) => {
		if (!confirm(intl.formatMessage({ id: "firewall-policies.delete-confirm" }, { name: policy.name }))) return;
		await deleteFirewallPolicy(policy.id);
		await invalidate();
	};

	return (
		<Card className="mt-4 border-t-4 border-orange-500/50">
			<CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
				<div>
					<CardTitle className="flex items-center gap-2 text-2xl font-bold">
						<IconShieldLock className="h-6 w-6 text-orange-500" />
						<T id="firewall-policies" />
					</CardTitle>
					<CardDescription className="mt-1">
						<T id="firewall-policies.description" />
					</CardDescription>
				</div>
				<Button onClick={() => startEdit()}>
					<IconPlus className="mr-2 h-4 w-4" />
					<T id="firewall-policies.new" />
				</Button>
			</CardHeader>
			<CardContent>
				<Alert className="mb-4">
					<AlertDescription>
						<T id="firewall-policies.geoip.warning" />
					</AlertDescription>
				</Alert>
				{error ? (
					<Alert variant="destructive">
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>{error.message}</AlertDescription>
					</Alert>
				) : null}
				<div className="overflow-x-auto rounded-md border">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>
									<T id="name" />
								</TableHead>
								<TableHead>
									<T id="firewall-policies.mode" />
								</TableHead>
								<TableHead>
									<T id="firewall-policies.active-cidrs" />
								</TableHead>
								<TableHead>
									<T id="firewall-policies.last-updated" />
								</TableHead>
								<TableHead className="text-right">
									<T id="options" />
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoading ? (
								<TableRow>
									<TableCell colSpan={5} className="py-8 text-center">
										<T id="loading" />
									</TableCell>
								</TableRow>
							) : null}
							{!isLoading && !data.length ? (
								<TableRow>
									<TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
										<T id="firewall-policies.empty" />
									</TableCell>
								</TableRow>
							) : null}
							{data.map((policy) => (
								<TableRow key={policy.id}>
									<TableCell className="font-medium">
										{policy.name}
										{!policy.enabled ? (
											<span className="ml-2 text-muted-foreground">
												(<T id="disabled" />)
											</span>
										) : null}
									</TableCell>
									<TableCell>
										<T id={`firewall-policies.geo-mode.${policy.geoMode}`} />
									</TableCell>
									<TableCell>{policy.totalCidrs.toLocaleString()}</TableCell>
									<TableCell className="max-w-64 truncate" title={policy.lastError || undefined}>
										{policy.lastError || policy.lastUpdatedOn || "—"}
									</TableCell>
									<TableCell className="space-x-1 text-right">
										<Button
											variant="ghost"
											size="icon"
											aria-label={intl.formatMessage({ id: "firewall-policies.refresh" })}
											disabled={refreshingId === policy.id}
											onClick={() => refresh(policy)}
										>
											{refreshingId === policy.id ? (
												<Loader2 className="h-4 w-4 animate-spin" />
											) : (
												<IconRefresh className="h-4 w-4" />
											)}
										</Button>
										<Button
											variant="ghost"
											size="icon"
											aria-label={intl.formatMessage({ id: "firewall-policies.edit" })}
											onClick={() => startEdit(policy)}
										>
											<IconEdit className="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="text-destructive"
											aria-label={intl.formatMessage({ id: "action.delete" })}
											onClick={() => remove(policy)}
										>
											<IconTrash className="h-4 w-4" />
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			</CardContent>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
					<DialogHeader>
						<DialogTitle>
							<T id={selected ? "firewall-policies.edit" : "firewall-policies.new"} />
						</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						{formError ? (
							<Alert variant="destructive">
								<AlertDescription>{formError}</AlertDescription>
							</Alert>
						) : null}
						<div className="space-y-2">
							<Label htmlFor="firewall-name">
								<T id="name" />
							</Label>
							<Input
								id="firewall-name"
								value={draft.name}
								onChange={(event) => setDraft({ ...draft, name: event.target.value })}
							/>
						</div>
						<div className="flex items-center justify-between rounded-md border p-3">
							<Label htmlFor="firewall-enabled">
								<T id="enabled" />
							</Label>
							<Switch
								id="firewall-enabled"
								checked={draft.enabled}
								onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
							/>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2">
								<Label>
									<T id="firewall-policies.geo-mode" />
								</Label>
								<Select
									value={draft.geoMode}
									onValueChange={(geoMode: FirewallPolicy["geoMode"]) =>
										setDraft({ ...draft, geoMode })
									}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="off">
											<T id="firewall-policies.geo-mode.off" />
										</SelectItem>
										<SelectItem value="allow">
											<T id="firewall-policies.geo-mode.allow" />
										</SelectItem>
										<SelectItem value="block">
											<T id="firewall-policies.geo-mode.block" />
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
							<div className="space-y-2">
								<Label>
									<T id="firewall-policies.action" />
								</Label>
								<Select
									value={draft.action}
									onValueChange={(action: FirewallPolicy["action"]) => setDraft({ ...draft, action })}
								>
									<SelectTrigger>
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectItem value="deny">
											<T id="firewall-policies.action.deny" />
										</SelectItem>
										<SelectItem value="drop">
											<T id="firewall-policies.action.drop" />
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						</div>
						{draft.geoMode !== "off" ? (
							<div className="space-y-2">
								<Label>
									<T id="firewall-policies.countries" />
								</Label>
								<Input
									value={draft.geoCountries}
									placeholder="DE, AT, CH"
									onChange={(event) => setDraft({ ...draft, geoCountries: event.target.value })}
								/>
							</div>
						) : null}
						<div className="space-y-2">
							<Label>
								<T id="firewall-policies.allow-cidrs" />
							</Label>
							<Textarea
								rows={3}
								value={draft.allowCidrs}
								onChange={(event) => setDraft({ ...draft, allowCidrs: event.target.value })}
							/>
						</div>
						<div className="space-y-2">
							<Label>
								<T id="firewall-policies.block-cidrs" />
							</Label>
							<Textarea
								rows={3}
								value={draft.blockCidrs}
								onChange={(event) => setDraft({ ...draft, blockCidrs: event.target.value })}
							/>
						</div>
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<Label>
									<T id="firewall-policies.feeds" />
								</Label>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() =>
										setDraft({
											...draft,
											feedUrls: newlineSeparatedLines(`${draft.feedUrls}\n${X4B_VPN_FEED}`).join(
												"\n",
											),
										})
									}
								>
									<T id="firewall-policies.x4b-vpn" />
								</Button>
							</div>
							<Textarea
								rows={3}
								value={draft.feedUrls}
								onChange={(event) => setDraft({ ...draft, feedUrls: event.target.value })}
							/>
							<p className="text-sm text-muted-foreground">
								<T id="firewall-policies.feeds.help" />
							</p>
						</div>
						<div className="max-w-52 space-y-2">
							<Label>
								<T id="firewall-policies.refresh-interval" />
							</Label>
							<Input
								type="number"
								min={1}
								max={168}
								value={draft.refreshIntervalHours}
								onChange={(event) =>
									setDraft({ ...draft, refreshIntervalHours: Number(event.target.value) })
								}
							/>
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => setOpen(false)}>
							<T id="cancel" />
						</Button>
						<Button type="button" onClick={save} disabled={saving}>
							{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
							<T id="save" />
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</Card>
	);
}

export default function FirewallPolicies() {
	return (
		<HasPermission section={ADMIN} permission={MANAGE} pageLoading>
			<FirewallPoliciesContent />
		</HasPermission>
	);
}
