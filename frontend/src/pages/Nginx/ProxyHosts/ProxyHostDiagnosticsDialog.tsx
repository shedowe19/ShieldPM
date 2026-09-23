import { IconActivityHeartbeat, IconRefresh } from "@tabler/icons-react";
import { useEffect, useId, useRef, useState } from "react";
import type { ProxyHostDiagnosticCheck } from "src/api/backend/diagnoseProxyHost";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Badge, type BadgeProps } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Input } from "src/components/ui/input";
import { useLocaleRevision } from "src/context/LocaleContext";
import { useProxyHostDiagnostics } from "src/hooks/useProxyHostDiagnostics";
import { intl, T } from "src/locale";
import { formatDateTime } from "src/locale/Utils";

const checkNames: Record<string, string> = {
	dns: "proxy-host.diagnostics.dns",
	tls: "proxy-host.diagnostics.tls",
	route: "proxy-host.diagnostics.route",
	upstream: "proxy-host.diagnostics.upstream",
	auth: "proxy-host.diagnostics.auth",
	websocket: "proxy-host.diagnostics.websocket",
};

const statusVariants: Record<ProxyHostDiagnosticCheck["status"], BadgeProps["variant"]> = {
	pass: "success",
	warn: "warning",
	fail: "destructive",
	skip: "secondary",
};

// The server validates the path again before using it for a local, bounded probe.
const validWebsocketPath = (path: string) =>
	path.length <= 256 &&
	/^\/(?!\/)[A-Za-z0-9._~!$&'()+,;=:@/-]*$/.test(path) &&
	!path.includes("//") &&
	!path.split("/").some((part) => part === "." || part === "..");

function checkDetail(check: ProxyHostDiagnosticCheck) {
	if (!check.detail) return null;
	if (
		/^-?\d+$/.test(check.detail) &&
		["tls.valid", "tls.expiring", "tls.expired", "tls.untrusted"].includes(check.message)
	) {
		const days = Number(check.detail);
		return (
			<T
				id={days < 0 ? "proxy-host.diagnostics.days-expired" : "proxy-host.diagnostics.days"}
				data={{ days: Math.abs(days) }}
			/>
		);
	}
	if (/^\d{3}$/.test(check.detail) && ["route", "auth", "websocket"].includes(check.key)) {
		return <T id="proxy-host.diagnostics.http-status" data={{ status: check.detail }} />;
	}
	return check.detail;
}

interface Props {
	hostId: number;
	domain: string;
	onClose: () => void;
}

export function ProxyHostDiagnosticsDialog({ hostId, domain, onClose }: Props) {
	useLocaleRevision();
	const { mutate, data, isPending, error } = useProxyHostDiagnostics();
	const started = useRef(false);
	const websocketPathId = useId();
	const [websocketPath, setWebsocketPath] = useState("/");
	const [checkedWebsocketPath, setCheckedWebsocketPath] = useState("/");
	const pathIsValid = validWebsocketPath(websocketPath);

	useEffect(() => {
		if (started.current) return;
		started.current = true;
		mutate({ id: hostId, websocketPath: "/" });
	}, [hostId, mutate]);

	const rerun = () => {
		if (!pathIsValid || isPending) return;
		setCheckedWebsocketPath(websocketPath);
		mutate({ id: hostId, websocketPath });
	};

	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconActivityHeartbeat className="h-5 w-5" />
						<T id="proxy-host.diagnostics.title" />
					</DialogTitle>
					<p className="text-sm text-muted-foreground break-all">{data?.domain || domain}</p>
				</DialogHeader>
				<div className="space-y-1 pt-3">
					<label className="text-sm font-medium" htmlFor={websocketPathId}>
						<T id="proxy-host.diagnostics.websocket-path" />
					</label>
					<Input
						id={websocketPathId}
						value={websocketPath}
						placeholder="/api/ws"
						maxLength={256}
						aria-invalid={!pathIsValid}
						onChange={(event) => setWebsocketPath(event.target.value)}
					/>
					{!pathIsValid && (
						<p className="text-xs text-destructive" role="alert">
							<T id="proxy-host.diagnostics.websocket-path-invalid" />
						</p>
					)}
				</div>
				<div aria-live="polite" className="space-y-3 py-3">
					{isPending && (
						<p className="text-sm text-muted-foreground">
							<T id="proxy-host.diagnostics.running" />
						</p>
					)}
					{error && (
						<Alert variant="destructive" role="alert">
							<AlertTitle>
								<T id="error.title" />
							</AlertTitle>
							<AlertDescription>{error.message}</AlertDescription>
						</Alert>
					)}
					{data && !isPending && (
						<>
							{data.checks.length === 0 && (
								<p className="text-sm">
									<T id="proxy-host.diagnostics.no-results" />
								</p>
							)}
							{data.checks.map((check, index) => (
								<div key={`${check.key}-${index}`} className="rounded-lg border bg-card p-3 space-y-1">
									<div className="flex items-center justify-between gap-2">
										<h3 className="font-medium">
											{checkNames[check.key] ? <T id={checkNames[check.key]} /> : check.key}
										</h3>
										<Badge variant={statusVariants[check.status] || "secondary"}>
											<T id={`proxy-host.diagnostics.status.${check.status}`} />
										</Badge>
									</div>
									<p className="text-sm break-words">
										{intl.formatMessage({
											id: `proxy-host.diagnostics.result.${check.message}`,
											defaultMessage: check.message,
										})}
									</p>
									{check.detail && (
										<p className="text-xs text-muted-foreground break-words whitespace-pre-wrap">
											{checkDetail(check)}
										</p>
									)}
									{check.key === "websocket" && check.status !== "skip" && (
										<p className="text-xs text-muted-foreground">
											<T
												id="proxy-host.diagnostics.websocket-scope"
												data={{ path: checkedWebsocketPath }}
											/>
										</p>
									)}
								</div>
							))}
							<p className="text-xs text-muted-foreground">
								<T id="proxy-host.diagnostics.checked-at" /> {formatDateTime(data.checkedAt)}
							</p>
						</>
					)}
				</div>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						<T id="action.close" />
					</Button>
					<Button type="button" disabled={isPending || !pathIsValid} onClick={rerun}>
						<IconRefresh className="mr-2 h-4 w-4" />
						<T id="proxy-host.diagnostics.run-again" />
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
