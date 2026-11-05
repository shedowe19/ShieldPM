import type { ReactNode } from "react";
import type { FlowHost, TrafficFlowSnapshot } from "src/api/backend/getTrafficFlow";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "src/components/ui/tooltip";
import { intl } from "src/locale";

export const flowText = (name: string, values?: Record<string, string | number>) =>
	intl.formatMessage({ id: `analytics.flow.${name}` }, values);

function Connection({ kind }: { kind: "configured" | "observed" | "unknown" }) {
	return (
		<svg width="32" height="24" viewBox="0 0 32 24" aria-hidden="true" className="shrink-0 text-muted-foreground">
			<line
				x1="0"
				x2="32"
				y1="12"
				y2="12"
				stroke="currentColor"
				strokeWidth="2"
				strokeDasharray={kind === "configured" ? "6 4" : kind === "unknown" ? "2 3" : undefined}
			/>
		</svg>
	);
}

function Detail({ description, children }: { description: string; children: ReactNode }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className="w-full rounded-md border p-2 text-left focus-visible:outline focus-visible:outline-ring"
					aria-label={description}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent className="max-w-sm motion-reduce:animate-none">{description}</TooltipContent>
		</Tooltip>
	);
}

export function TrafficFlowRows({ hosts, snapshot }: { hosts: FlowHost[]; snapshot: TrafficFlowSnapshot }) {
	return (
		<TooltipProvider>
			<div className="overflow-x-auto">
				<div className="min-w-[800px] space-y-4">
					<div className="grid grid-cols-[1fr_32px_1fr_32px_1fr_1fr] px-3 text-sm font-semibold">
						<div>{flowText("clients")}</div>
						<div />
						<div>{flowText("internet")}</div>
						<div />
						<div>{flowText("hosts")}</div>
						<div className="pl-8">{flowText("upstreams")}</div>
					</div>
					{hosts.map((host) => (
						<section
							key={host.id}
							aria-label={host.domains.join(", ") || String(host.id)}
							className="grid h-56 grid-cols-[1fr_32px_1fr_32px_1fr_1fr] items-center rounded-md border p-3 text-sm"
						>
							<div className="max-h-48 min-w-0 overflow-y-auto">
								<details>
									<summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-ring">
										{flowText("groups", { count: host.clients.length })}
									</summary>
									<ul className="mt-2 space-y-2">
										{[...host.clients]
											.sort((a, b) => a.id.localeCompare(b.id))
											.map((client) => (
												<li key={client.id}>
													<Detail
														description={flowText("client-detail", {
															requests: client.requests,
															bytes: client.completedBytes,
															lastSeen: client.lastSeen,
															start: snapshot.window.start,
															end: snapshot.window.end,
														})}
													>
														<div className="break-all">{client.label}</div>
														<div className="text-muted-foreground">
															{flowText("requests", { count: client.requests })}
														</div>
													</Detail>
												</li>
											))}
									</ul>
								</details>
								{host.clients.length === 0 && (
									<p className="text-muted-foreground">{flowText("no-observations")}</p>
								)}
							</div>
							<Connection kind={host.clients.length ? "observed" : "unknown"} />
							<div className="rounded-md border bg-muted/40 p-3 text-center">
								{flowText("internet")}
								<p className="text-xs text-muted-foreground">{flowText("schematic")}</p>
							</div>
							<Connection kind={host.clients.length ? "observed" : "unknown"} />
							<div className="max-h-48 min-w-0 overflow-y-auto rounded-md border p-3">
								<div className="break-all font-medium">{host.domains.join(", ") || `#${host.id}`}</div>
								<div className="text-xs text-muted-foreground">
									#{host.id} · {flowText(host.enabled ? "enabled" : "host-disabled")}
								</div>
							</div>
							<ul className="max-h-48 space-y-2 overflow-y-auto">
								{[...host.targets]
									.sort((a, b) => a.id.localeCompare(b.id))
									.map((target) => (
										<li key={target.id} className="flex items-center">
											<Connection kind={target.kind} />
											<Detail
												description={flowText("target-detail", {
													kind: flowText(target.kind),
													lastSeen: target.lastSeen || flowText("unknown"),
													requests: target.requests ?? flowText("unknown"),
													start: snapshot.window.start,
													end: snapshot.window.end,
												})}
											>
												<div className="break-all">{target.label}</div>
												<div className="text-xs text-muted-foreground">
													{flowText(target.kind)} · {flowText("unknown-rate")}
												</div>
											</Detail>
										</li>
									))}
							</ul>
						</section>
					))}
				</div>
			</div>
		</TooltipProvider>
	);
}

export function TrafficFlowList({ hosts }: { hosts: FlowHost[] }) {
	return (
		<ul className="space-y-4 text-sm">
			{hosts.map((host) => (
				<li key={host.id} className="rounded border p-3">
					<h4 className="font-semibold">{host.domains.join(", ") || `#${host.id}`}</h4>
					<p>{flowText("unknown-rate")}</p>
					<ul className="mt-2 space-y-1">
						{host.clients.map((client) => (
							<li key={client.id}>
								{client.label} → {flowText("internet")} → #{host.id}:{" "}
								{flowText("requests", { count: client.requests })}
								{", "}
								{flowText("completed-bytes", { count: client.completedBytes })} · {client.lastSeen}
							</li>
						))}
					</ul>
					<ul className="mt-2 space-y-1">
						{host.targets.map((target) => (
							<li key={target.id}>
								#{host.id} → {target.label}: {flowText(target.kind)} ·{" "}
								{target.lastSeen || flowText("unknown")}
							</li>
						))}
					</ul>
				</li>
			))}
		</ul>
	);
}
