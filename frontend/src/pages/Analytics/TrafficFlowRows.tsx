import { Globe } from "lucide-react";
import type { ReactNode } from "react";
import type { FlowHost, TrafficFlowSnapshot } from "src/api/backend/getTrafficFlow";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "src/components/ui/tooltip";
import { intl } from "src/locale";
import { FlowConnection, FlowRateComponents, FlowRateLabel, rateDescription } from "./TrafficFlowRate";

const flowColumns = "minmax(180px,1fr) 32px 64px 32px minmax(180px,1fr) minmax(220px,1fr)";

export const flowText = (name: string, values?: Record<string, string | number>) =>
	intl.formatMessage({ id: `analytics.flow.${name}` }, values);

export const displayClientLabel = (label: string, mode?: "prefix" | "address") =>
	mode !== "address" && /^\d+\.\d+\.\d+\.0\/24$/.test(label) ? label.replace(/0\/24$/, "*") : label;

function Detail({ description, children }: { description: string; children: ReactNode }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					className="min-w-0 w-full rounded-md border p-2 text-left focus-visible:outline focus-visible:outline-ring"
					aria-label={description}
				>
					{children}
				</button>
			</TooltipTrigger>
			<TooltipContent className="max-w-sm motion-reduce:animate-none">{description}</TooltipContent>
		</Tooltip>
	);
}

export function TrafficFlowRows({
	hosts,
	snapshot,
	live = false,
}: {
	hosts: FlowHost[];
	snapshot: TrafficFlowSnapshot;
	live?: boolean;
}) {
	return (
		<TooltipProvider>
			<div className="overflow-x-auto">
				<div className="space-y-3" style={{ minWidth: 780 }}>
					<div className="grid px-3 text-sm font-semibold" style={{ gridTemplateColumns: flowColumns }}>
						<div>{flowText(snapshot.clientMode === "address" ? "client-addresses" : "clients")}</div>
						<div />
						<div>
							<span className="sr-only">{flowText("internet")}</span>
						</div>
						<div />
						<div>{flowText("hosts")}</div>
						<div className="pl-8">{flowText("upstreams")}</div>
					</div>
					{hosts.map((host) => (
						<section
							key={host.id}
							aria-label={host.domains.join(", ") || String(host.id)}
							className="grid h-48 items-center rounded-md border p-3 text-sm"
							style={{ gridTemplateColumns: flowColumns }}
						>
							<div className="max-h-40 min-w-0 overflow-y-auto">
								<details open>
									<summary className="cursor-pointer rounded focus-visible:outline focus-visible:outline-ring">
										{flowText(snapshot.clientMode === "address" ? "addresses" : "groups", {
											count: host.clients.length,
										})}
									</summary>
									<ul className="mt-2 space-y-2">
										{[...host.clients]
											.sort((a, b) => a.id.localeCompare(b.id))
											.map((client) => (
												<li key={client.id}>
													<Detail
														description={`${rateDescription(client.rate, client.rateIncomplete, client.mixedSemantics, client.unknownReason)} ${flowText(
															"client-detail",
															{
																requests: client.requests,
																bytes: client.completedBytes,
																lastSeen: client.lastSeen,
																start: snapshot.window.start,
																end: snapshot.window.end,
															},
														)}`}
													>
														<div className="flex items-center">
															<FlowConnection
																kind={client.rate ? "observed" : "unknown"}
																live={live && (client.activeRequests || 0) > 0}
																rate={client.rate}
															/>
															<span
																className="truncate font-mono text-xs"
																title={client.label}
															>
																{displayClientLabel(client.label, snapshot.clientMode)}
															</span>
														</div>
														<div className="text-xs text-muted-foreground">
															{flowText(
																snapshot.clientMode === "address"
																	? "client-address"
																	: "client-prefix",
															)}
														</div>
														<FlowRateLabel
															rate={client.rate}
															incomplete={client.rateIncomplete}
															mixed={client.mixedSemantics}
															reason={client.unknownReason}
														/>
														<div className="text-muted-foreground">
															{flowText("requests", { count: client.requests })}
														</div>
													</Detail>
													<FlowRateComponents
														components={client.rateComponents}
														live={live && (client.activeRequests || 0) > 0}
													/>
												</li>
											))}
									</ul>
								</details>
								{host.clients.length === 0 && (
									<p className="text-muted-foreground">{flowText("no-observations")}</p>
								)}
							</div>
							<FlowConnection
								kind={host.clients.length ? "observed" : "unknown"}
								rate={host.clientRate}
								live={live && host.clients.some((client) => (client.activeRequests || 0) > 0)}
							/>
							<div
								className="flex flex-col items-center gap-1 text-center text-xs text-muted-foreground"
								title={flowText("schematic")}
							>
								<div className="rounded-full bg-muted p-2">
									<Globe size={22} aria-hidden="true" />
								</div>
								<span>{flowText("internet")}</span>
							</div>
							<FlowConnection
								kind={host.clients.length ? "observed" : "unknown"}
								rate={host.clientRate}
								live={live && host.clients.some((client) => (client.activeRequests || 0) > 0)}
							/>
							<div className="max-h-40 min-w-0 overflow-y-auto rounded-md border p-3">
								<div className="truncate font-medium" title={host.domains.join(", ")}>
									{host.domains[0] || `#${host.id}`}
								</div>
								{host.domains.length > 1 && (
									<div className="text-xs text-muted-foreground" title={host.domains.join(", ")}>
										{flowText("additional-domains", { count: host.domains.length - 1 })}
									</div>
								)}
								<div className="text-xs text-muted-foreground">
									#{host.id} · {flowText(host.enabled ? "enabled" : "host-disabled")}
								</div>
							</div>
							<ul className="max-h-40 space-y-2 overflow-y-auto">
								{[...host.targets]
									.sort((a, b) => a.id.localeCompare(b.id))
									.map((target) => (
										<li key={target.id} className="flex min-w-0 items-center">
											<FlowConnection
												kind={target.kind}
												rate={target.rate}
												live={live && (target.activeRequests || 0) > 0}
											/>
											<Detail
												description={`${rateDescription(target.rate, target.rateIncomplete, target.mixedSemantics, target.unknownReason)} ${flowText(
													"target-detail",
													{
														kind: flowText(target.kind),
														lastSeen: target.lastSeen || flowText("unknown"),
														requests: target.requests ?? flowText("unknown"),
														start: snapshot.window.start,
														end: snapshot.window.end,
													},
												)}`}
											>
												<div className="truncate font-mono text-xs" title={target.label}>
													{target.label}
												</div>
												<div className="text-xs text-muted-foreground">
													{flowText(
														target.origins?.includes("configured") &&
															target.origins.includes("observed")
															? "configured-observed"
															: target.kind,
													)}{" "}
													·{" "}
													<FlowRateLabel
														rate={target.rate}
														incomplete={target.rateIncomplete}
														mixed={target.mixedSemantics}
														reason={target.unknownReason}
													/>
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

export function TrafficFlowList({ hosts, clientMode }: { hosts: FlowHost[]; clientMode?: "prefix" | "address" }) {
	return (
		<ul className="space-y-4 text-sm">
			{hosts.map((host) => (
				<li key={host.id} className="rounded border p-3">
					<h4 className="font-semibold">{host.domains.join(", ") || `#${host.id}`}</h4>
					<p>
						<FlowRateLabel rate={host.clientRate} incomplete={host.clientRateIncomplete} />
					</p>
					<ul className="mt-2 space-y-1">
						{host.clients.map((client) => (
							<li key={client.id}>
								{displayClientLabel(client.label, clientMode)} → {flowText("internet")} → #{host.id}:{" "}
								{flowText("requests", { count: client.requests })}
								{", "}
								{flowText("completed-bytes", { count: client.completedBytes })} · {client.lastSeen} ·{" "}
								<FlowRateLabel
									rate={client.rate}
									incomplete={client.rateIncomplete}
									mixed={client.mixedSemantics}
									reason={client.unknownReason}
								/>
								<FlowRateComponents components={client.rateComponents} />
							</li>
						))}
					</ul>
					<ul className="mt-2 space-y-1">
						{host.targets.map((target) => (
							<li key={target.id}>
								#{host.id} → {target.label}:{" "}
								{flowText(
									target.origins?.includes("configured") && target.origins.includes("observed")
										? "configured-observed"
										: target.kind,
								)}{" "}
								· {target.lastSeen || flowText("unknown")} ·{" "}
								<FlowRateLabel
									rate={target.rate}
									incomplete={target.rateIncomplete}
									mixed={target.mixedSemantics}
									reason={target.unknownReason}
								/>
							</li>
						))}
					</ul>
				</li>
			))}
		</ul>
	);
}
