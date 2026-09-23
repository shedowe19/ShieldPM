import { IconActivityHeartbeat, IconPlayerPlay } from "@tabler/icons-react";
import { type FormEvent, useState } from "react";
import type { ProxyHostMonitorConfig, ProxyHostMonitorDetail } from "src/api/backend/proxyHostMonitor";
import { HasPermission } from "src/components";
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
import { Switch } from "src/components/ui/switch";
import { Textarea } from "src/components/ui/textarea";
import {
	useCheckProxyHostMonitor,
	useProxyHostMonitor,
	useUpdateProxyHostMonitor,
} from "src/hooks/useProxyHostMonitor";
import { intl, T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { formatMonitorTime, MonitorStatus, monitorMessage } from "./MonitorStatus";

const defaultConfig: ProxyHostMonitorConfig = {
	enabled: true,
	type: "http",
	path: "/",
	intervalSeconds: 60,
	timeoutMs: 5000,
	expectedStatus: 200,
	alertEnabled: false,
	upstreamCa: null,
	upstreamServerName: null,
};

const certificateStart = "-----BEGIN CERTIFICATE-----";
const certificateEnd = "-----END CERTIFICATE-----";
const dnsLabel = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i;

function validCertificateBundle(pem: string): boolean {
	let remaining = pem.trim();
	let count = 0;
	while (remaining) {
		if (!remaining.startsWith(certificateStart) || count === 8) return false;
		remaining = remaining.slice(certificateStart.length);
		const end = remaining.indexOf(certificateEnd);
		if (end < 0 || !/^[A-Za-z0-9+/=\s]+$/.test(remaining.slice(0, end))) return false;
		remaining = remaining.slice(end + certificateEnd.length).trim();
		count++;
	}
	return count > 0;
}

function validDnsName(name: string): boolean {
	return name.length <= 253 && name.split(".").every((label) => label.length <= 63 && dnsLabel.test(label));
}

interface Props {
	hostId: number;
	domain: string;
	forwardScheme: string;
	hostEnabled: boolean;
	targetSupported: boolean;
	onClose: () => void;
}

function MonitorSettings({
	hostId,
	config: savedConfig,
	canCheck,
	forwardScheme,
}: {
	hostId: number;
	config: ProxyHostMonitorConfig | null;
	canCheck: boolean;
	forwardScheme: string;
}) {
	const supportsHttp = ["http", "https"].includes(forwardScheme);
	const [config, setConfig] = useState<ProxyHostMonitorConfig>(() => ({
		...defaultConfig,
		type: supportsHttp ? "http" : "tcp",
		...(savedConfig ?? {}),
	}));
	const [error, setError] = useState("");
	const update = useUpdateProxyHostMonitor(hostId);
	const check = useCheckProxyHostMonitor(hostId);
	const usesUpstreamTls = config.type === "http" && forwardScheme === "https";

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setError("");
		if (config.timeoutMs >= config.intervalSeconds * 1000) {
			setError(intl.formatMessage({ id: "proxy-host.monitor.timeout-error" }));
			return;
		}
		if (config.type === "http" && !/^\/(?!\/)[A-Za-z0-9/_~.!$&'()*+,;=:-]*$/.test(config.path)) {
			setError(intl.formatMessage({ id: "proxy-host.monitor.path-error" }));
			return;
		}
		const upstreamCa = usesUpstreamTls ? config.upstreamCa?.trim() || null : null;
		const upstreamServerName = usesUpstreamTls ? config.upstreamServerName?.trim() || null : null;
		if (upstreamCa && (upstreamCa.length > 65_535 || !validCertificateBundle(upstreamCa))) {
			setError(intl.formatMessage({ id: "proxy-host.monitor.upstream-ca-error" }));
			return;
		}
		if (upstreamServerName && !validDnsName(upstreamServerName)) {
			setError(intl.formatMessage({ id: "proxy-host.monitor.upstream-server-name-error" }));
			return;
		}
		update.mutate(
			{ ...config, upstreamCa, upstreamServerName },
			{
				onError: (reason) => setError(reason.message),
			},
		);
	};

	const runCheck = () => {
		setError("");
		check.mutate(undefined, {
			onError: (reason) => setError(reason.message),
		});
	};

	return (
		<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
			<form onSubmit={submit} className="space-y-4 border-t pt-4">
				<div className="flex items-center justify-between gap-4">
					<div>
						<Label htmlFor="monitor-enabled">
							<T id="proxy-host.monitor.enabled" />
						</Label>
						<p className="text-xs text-muted-foreground">
							<T id="proxy-host.monitor.enabled-description" />
						</p>
					</div>
					<Switch
						id="monitor-enabled"
						checked={config.enabled}
						onCheckedChange={(enabled) => setConfig((old) => ({ ...old, enabled }))}
					/>
				</div>
				<div className="grid gap-4 sm:grid-cols-2">
					<div className="space-y-2">
						<Label htmlFor="monitor-type">
							<T id="proxy-host.monitor.type" />
						</Label>
						<select
							id="monitor-type"
							value={config.type}
							onChange={(event) =>
								setConfig((old) => ({ ...old, type: event.target.value as "http" | "tcp" }))
							}
							className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
						>
							<option value="http" disabled={!supportsHttp}>
								HTTP(S)
							</option>
							<option value="tcp">TCP</option>
						</select>
					</div>
					<div className="space-y-2">
						<Label htmlFor="monitor-interval">
							<T id="proxy-host.monitor.interval" />
						</Label>
						<Input
							id="monitor-interval"
							type="number"
							min={15}
							max={3600}
							required
							value={config.intervalSeconds}
							onChange={(event) =>
								setConfig((old) => ({ ...old, intervalSeconds: Number(event.target.value) }))
							}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="monitor-timeout">
							<T id="proxy-host.monitor.timeout" />
						</Label>
						<Input
							id="monitor-timeout"
							type="number"
							min={500}
							max={15000}
							required
							value={config.timeoutMs}
							onChange={(event) =>
								setConfig((old) => ({ ...old, timeoutMs: Number(event.target.value) }))
							}
						/>
					</div>
					{config.type === "http" && (
						<>
							<div className="space-y-2">
								<Label htmlFor="monitor-path">
									<T id="proxy-host.monitor.path" />
								</Label>
								<Input
									id="monitor-path"
									type="text"
									required
									maxLength={255}
									pattern="/.*"
									value={config.path}
									onChange={(event) => setConfig((old) => ({ ...old, path: event.target.value }))}
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="monitor-status">
									<T id="proxy-host.monitor.expected-status" />
								</Label>
								<Input
									id="monitor-status"
									type="number"
									min={100}
									max={599}
									required
									value={config.expectedStatus}
									onChange={(event) =>
										setConfig((old) => ({ ...old, expectedStatus: Number(event.target.value) }))
									}
								/>
							</div>
						</>
					)}
				</div>
				{usesUpstreamTls && (
					<div className="space-y-4 rounded-md border p-4">
						<div className="space-y-2">
							<Label htmlFor="monitor-upstream-server-name">
								<T id="proxy-host.monitor.upstream-server-name" />
							</Label>
							<Input
								id="monitor-upstream-server-name"
								type="text"
								maxLength={253}
								placeholder="service.example.test"
								value={config.upstreamServerName ?? ""}
								onChange={(event) =>
									setConfig((old) => ({ ...old, upstreamServerName: event.target.value }))
								}
							/>
							<p className="text-xs text-muted-foreground">
								<T id="proxy-host.monitor.upstream-server-name-description" />
							</p>
						</div>
						<div className="space-y-2">
							<Label htmlFor="monitor-upstream-ca">
								<T id="proxy-host.monitor.upstream-ca" />
							</Label>
							<Textarea
								id="monitor-upstream-ca"
								rows={5}
								maxLength={65_535}
								spellCheck={false}
								className="font-mono text-xs"
								placeholder="-----BEGIN CERTIFICATE-----"
								value={config.upstreamCa ?? ""}
								onChange={(event) => setConfig((old) => ({ ...old, upstreamCa: event.target.value }))}
							/>
							<p className="text-xs text-muted-foreground">
								<T id="proxy-host.monitor.upstream-ca-description" />
							</p>
						</div>
					</div>
				)}
				<div className="flex items-center justify-between gap-4">
					<div>
						<Label htmlFor="monitor-alert">
							<T id="proxy-host.monitor.alert" />
						</Label>
						<p className="text-xs text-muted-foreground">
							<T id="proxy-host.monitor.alert-description" />
						</p>
					</div>
					<Switch
						id="monitor-alert"
						checked={config.alertEnabled}
						onCheckedChange={(alertEnabled) => setConfig((old) => ({ ...old, alertEnabled }))}
					/>
				</div>
				{error && (
					<Alert variant="destructive" role="alert">
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}
				<DialogFooter className="gap-2">
					<Button
						type="button"
						variant="outline"
						disabled={!canCheck || check.isPending || update.isPending}
						onClick={runCheck}
					>
						<IconPlayerPlay className="mr-2 h-4 w-4" />
						<T id="proxy-host.monitor.check-now" />
					</Button>
					<Button type="submit" disabled={update.isPending || check.isPending}>
						<T id="save" />
					</Button>
				</DialogFooter>
			</form>
		</HasPermission>
	);
}

function MonitorMeasurements({ detail }: { detail: ProxyHostMonitorDetail }) {
	return (
		<div className="space-y-4">
			<div className="rounded-md border bg-muted/30 p-3 space-y-2">
				<div className="flex items-center justify-between gap-3">
					<span className="font-medium">
						<T id="proxy-host.monitor.current-status" />
					</span>
					{detail.config ? (
						<MonitorStatus status={detail.status} />
					) : (
						<T id="proxy-host.monitor.not-configured" />
					)}
				</div>
				{detail.status && (
					<>
						<p className="text-sm text-muted-foreground">
							<T id="proxy-host.monitor.last-checked" />: {formatMonitorTime(detail.status.checkedAt)}
							{detail.status.statusCode != null ? ` · HTTP ${detail.status.statusCode}` : ""}
						</p>
						{detail.status.message && (
							<p className="break-words text-sm">{monitorMessage(detail.status.message)}</p>
						)}
					</>
				)}
			</div>
			<div>
				<h3 className="mb-2 font-medium">
					<T id="proxy-host.monitor.history" />
				</h3>
				{detail.history.length === 0 ? (
					<p className="text-sm text-muted-foreground">
						<T id="proxy-host.monitor.no-history" />
					</p>
				) : (
					<ul className="max-h-40 divide-y overflow-auto rounded-md border">
						{detail.history.map((item) => (
							<li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-2 text-sm">
								<div className="flex items-center gap-2">
									<MonitorStatus status={item} />
									{item.transition && (
										<span className="text-xs text-muted-foreground">
											<T id="proxy-host.monitor.transition" />
										</span>
									)}
								</div>
								<div className="text-muted-foreground">
									{formatMonitorTime(item.checkedAt)}
									{item.statusCode != null ? ` · HTTP ${item.statusCode}` : ""}
								</div>
								{item.message && (
									<p className="w-full break-words text-xs">{monitorMessage(item.message)}</p>
								)}
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}

export function MonitorDialog({ hostId, domain, forwardScheme, hostEnabled, targetSupported, onClose }: Props) {
	const { data, isLoading, error } = useProxyHostMonitor(hostId);
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconActivityHeartbeat className="h-5 w-5" />
						<T id="proxy-host.monitor.title" />
					</DialogTitle>
					<DialogDescription className="break-all">{domain}</DialogDescription>
				</DialogHeader>
				{isLoading ? (
					<p>
						<T id="proxy-host.monitor.loading" />
					</p>
				) : error ? (
					<Alert variant="destructive" role="alert">
						<AlertDescription>{error.message}</AlertDescription>
					</Alert>
				) : data ? (
					<>
						<MonitorMeasurements detail={data} />
						{targetSupported ? (
							<MonitorSettings
								hostId={hostId}
								config={data.config}
								forwardScheme={forwardScheme}
								canCheck={Boolean(data.config?.enabled && hostEnabled)}
							/>
						) : (
							<p className="text-sm text-muted-foreground">
								<T id="proxy-host.monitor.unsupported" />
							</p>
						)}
					</>
				) : null}
			</DialogContent>
		</Dialog>
	);
}
