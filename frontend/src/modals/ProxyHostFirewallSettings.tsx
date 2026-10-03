import { useFormikContext } from "formik";
import { Eye, Plus, Shield, Trash2 } from "lucide-react";
import { useState } from "react";
import type { FirewallPolicy } from "src/api/backend";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { Textarea } from "src/components/ui/textarea";
import { useFirewallLists } from "src/hooks/useFirewallLists";
import { intl, T } from "src/locale";
import { renderProxyHostFirewallPreview } from "./ProxyHostFirewallPreview";
import { createProxyHostFirewallPolicy, type ProxyHostFormValues } from "./ProxyHostModalFormValues";

const ProxyHostFirewallSettings = () => {
	const { values, setFieldValue } = useFormikContext<ProxyHostFormValues>();
	const policy = createProxyHostFirewallPolicy(values.meta?.ipFirewall);
	const [allowlistText, setAllowlistText] = useState(() => policy.allowlist.join("\n"));
	const [showPreview, setShowPreview] = useState(false);
	const { data: lists = [], isLoading, isError } = useFirewallLists({ enabled: policy.enabled });
	const unavailableIds =
		isError || isLoading ? [] : policy.listIds.filter((id) => !lists.some((list) => list.id === id));

	const update = <K extends keyof FirewallPolicy>(field: K, value: FirewallPolicy[K]) =>
		setFieldValue(`meta.ipFirewall.${field}`, value);

	const selectList = (id: number, selected: boolean) =>
		update(
			"listIds",
			selected ? [...new Set([...policy.listIds, id])] : policy.listIds.filter((value) => value !== id),
		);

	const updateDenyEntry = (index: number, field: "address" | "reason", value: string) =>
		update(
			"denylist",
			policy.denylist.map((entry, position) => (position === index ? { ...entry, [field]: value } : entry)),
		);

	return (
		<section className="rounded-lg border bg-card/50 p-4 space-y-4" aria-labelledby="ip-firewall-heading">
			<div className="flex items-center justify-between gap-4">
				<div className="space-y-1">
					<Label
						htmlFor="ip-firewall-enabled"
						id="ip-firewall-heading"
						className="flex items-center gap-2 text-base"
					>
						<Shield className="h-4 w-4 text-primary" />
						<T id="firewall.host.title" />
					</Label>
					<p className="text-sm text-muted-foreground">
						<T id="firewall.host.description" />
					</p>
				</div>
				<Switch
					id="ip-firewall-enabled"
					checked={policy.enabled}
					onCheckedChange={(checked) => update("enabled", checked)}
				/>
			</div>

			{!policy.enabled && (
				<p className="text-sm text-muted-foreground">
					<T id="firewall.host.disabledHint" />
				</p>
			)}
			{policy.enabled && (
				<div className="space-y-5">
					<Alert>
						<AlertDescription>
							<T id="firewall.host.independentHint" />
						</AlertDescription>
					</Alert>
					<div className="space-y-3">
						<h4 className="text-sm font-medium">
							<T id="firewall.host.lists" />
						</h4>
						<p className="text-sm text-muted-foreground">
							<T id="firewall.host.listsHint" />
						</p>
						{isLoading && (
							<p role="status" className="text-sm">
								<T id="firewall.host.listsLoading" />
							</p>
						)}
						{isError && (
							<Alert>
								<AlertDescription>
									<T id="firewall.host.listsError" />
								</AlertDescription>
							</Alert>
						)}
						{!isLoading && !isError && lists.length === 0 && (
							<p className="text-sm text-muted-foreground">
								<T id="firewall.host.listsEmpty" />
							</p>
						)}
						{lists.map((list) => (
							<div key={list.id} className="flex items-start gap-3 rounded-md border p-3">
								<Checkbox
									id={`ip-firewall-list-${list.id}`}
									checked={policy.listIds.includes(list.id)}
									onCheckedChange={(checked) => selectList(list.id, checked === true)}
								/>
								<div className="space-y-1">
									<Label htmlFor={`ip-firewall-list-${list.id}`}>{list.name}</Label>
									<p className="text-xs text-muted-foreground">
										<T id="firewall.host.listEntries" tData={{ count: String(list.entryCount) }} />
									</p>
									{!list.enabled && (
										<p className="text-xs text-amber-600 dark:text-amber-400">
											<T id="firewall.host.listDisabled" />
										</p>
									)}
								</div>
							</div>
						))}
						{unavailableIds.map((id) => (
							<div key={id} className="flex items-start gap-3 rounded-md border border-amber-500/40 p-3">
								<Checkbox
									id={`ip-firewall-list-${id}`}
									checked
									onCheckedChange={(checked) => selectList(id, checked === true)}
								/>
								<div className="space-y-1">
									<Label htmlFor={`ip-firewall-list-${id}`}>
										<T id="firewall.host.listUnavailable" tData={{ id: String(id) }} />
									</Label>
									<p className="text-xs text-muted-foreground">
										<T id="firewall.host.listUnavailableHint" />
									</p>
								</div>
							</div>
						))}
					</div>

					<div className="space-y-3">
						<h4 className="text-sm font-medium">
							<T id="firewall.host.denylist" />
						</h4>
						<p className="text-sm text-muted-foreground">
							<T id="firewall.host.denylistHint" />
						</p>
						{policy.denylist.map((entry, index) => (
							<div key={index} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border p-3">
								<div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
									<div className="space-y-1">
										<Label htmlFor={`ip-firewall-address-${index}`}>
											<T id="firewall.host.address" />
										</Label>
										<Input
											id={`ip-firewall-address-${index}`}
											value={entry.address}
											placeholder="203.0.113.0/24"
											onChange={(event) => updateDenyEntry(index, "address", event.target.value)}
										/>
									</div>
									<div className="space-y-1">
										<Label htmlFor={`ip-firewall-reason-${index}`}>
											<T id="firewall.host.reason" />
										</Label>
										<Input
											id={`ip-firewall-reason-${index}`}
											value={entry.reason}
											maxLength={1000}
											onChange={(event) => updateDenyEntry(index, "reason", event.target.value)}
										/>
									</div>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="self-end"
									aria-label={intl.formatMessage(
										{ id: "firewall.host.removeEntry" },
										{ row: index + 1 },
									)}
									onClick={() =>
										update(
											"denylist",
											policy.denylist.filter((_, position) => position !== index),
										)
									}
								>
									<Trash2 className="h-4 w-4" />
								</Button>
							</div>
						))}
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={() => update("denylist", [...policy.denylist, { address: "", reason: "" }])}
						>
							<Plus className="mr-2 h-4 w-4" />
							<T id="firewall.host.addEntry" />
						</Button>
					</div>

					<div className="space-y-2">
						<Label htmlFor="ip-firewall-allowlist">
							<T id="firewall.host.allowlist" />
						</Label>
						<Textarea
							id="ip-firewall-allowlist"
							value={allowlistText}
							placeholder={"198.51.100.42\n2001:db8::/32"}
							className="font-mono text-sm"
							onChange={(event) => {
								setAllowlistText(event.target.value);
								update(
									"allowlist",
									event.target.value
										.split(/\r?\n/)
										.map((line) => line.trim())
										.filter((line) => line && !line.startsWith("#")),
								);
							}}
						/>
						<p className="text-sm text-muted-foreground">
							<T id="firewall.host.allowlistHint" />
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="ip-firewall-message">
							<T id="firewall.host.publicMessage" />
						</Label>
						<Textarea
							id="ip-firewall-message"
							value={policy.publicMessage}
							maxLength={2000}
							onChange={(event) => update("publicMessage", event.target.value)}
						/>
						<p className="text-sm text-muted-foreground">
							<T id="firewall.host.publicMessageHint" />
						</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="ip-firewall-support">
							<T id="firewall.host.supportUrl" />
						</Label>
						<Input
							id="ip-firewall-support"
							type="url"
							value={policy.supportUrl}
							maxLength={2048}
							placeholder="https://example.com/support"
							onChange={(event) => update("supportUrl", event.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="ip-firewall-note">
							<T id="firewall.host.internalNote" />
						</Label>
						<Textarea
							id="ip-firewall-note"
							value={policy.internalNote}
							maxLength={2000}
							onChange={(event) => update("internalNote", event.target.value)}
						/>
						<p className="text-sm text-muted-foreground">
							<T id="firewall.host.internalNoteHint" />
						</p>
					</div>
					<div className="space-y-3 border-t pt-4">
						<Button
							type="button"
							variant="outline"
							onClick={() => setShowPreview((shown) => !shown)}
							aria-expanded={showPreview}
							aria-controls="ip-firewall-page-preview"
						>
							<Eye className="mr-2 h-4 w-4" />
							<T id={showPreview ? "firewall.host.hidePreview" : "firewall.host.preview"} />
						</Button>
						{showPreview && (
							<div id="ip-firewall-page-preview" className="space-y-2">
								<p className="text-sm text-muted-foreground">
									<T id="firewall.host.previewHint" />
								</p>
								<iframe
									title={intl.formatMessage({ id: "firewall.host.previewTitle" })}
									sandbox=""
									referrerPolicy="no-referrer"
									className="w-full h-[730px] rounded-lg border"
									srcDoc={renderProxyHostFirewallPreview({
										policy,
										lists,
										host: values.domainNames?.[0],
										language: intl.locale,
									})}
								/>
							</div>
						)}
					</div>
				</div>
			)}
		</section>
	);
};

export default ProxyHostFirewallSettings;
