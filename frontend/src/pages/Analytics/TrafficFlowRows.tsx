import type { ReactNode } from "react";
import type { FlowHost, TrafficFlowSnapshot } from "src/api/backend/getTrafficFlow";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "src/components/ui/tooltip";
import { intl } from "src/locale";
import { FlowConnection, FlowRateLabel, rateDescription } from "./TrafficFlowRate";

export const flowText = (name: string, values?: Record<string, string | number>) =>
	intl.formatMessage({ id: `analytics.flow.${name}` }, values);

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
														description={`${rateDescription(client.rate, client.rateIncomplete)} ${flowText(
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
																rate={client.rate}
															/>
															<span className="break-all">{client.label}</span>
														</div>
														<FlowRateLabel
															rate={client.rate}
															incomplete={client.rateIncomplete}
														/>
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
							<FlowConnection
								kind={host.clients.length ? "observed" : "unknown"}
								rate={host.clientRate}
							/>
							<div className="rounded-md border bg-muted/40 p-3 text-center">
								{flowText("internet")}
								<p className="text-xs text-muted-foreground">{flowText("schematic")}</p>
							</div>
							<FlowConnection
								kind={host.clients.length ? "observed" : "unknown"}
								rate={host.clientRate}
							/>
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
											<FlowConnection kind={target.kind} rate={target.rate} />
											<Detail
												description={`${rateDescription(target.rate, target.rateIncomplete)} ${flowText(
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
												<div className="break-all">{target.label}</div>
												<div className="text-xs text-muted-foreground">
													{flowText(target.kind)} ·{" "}
													<FlowRateLabel
														rate={target.rate}
														incomplete={target.rateIncomplete}
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

export function TrafficFlowList({ hosts }: { hosts: FlowHost[] }) {
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
								{client.label} → {flowText("internet")} → #{host.id}:{" "}
								{flowText("requests", { count: client.requests })}
								{", "}
								{flowText("completed-bytes", { count: client.completedBytes })} · {client.lastSeen} ·{" "}
								<FlowRateLabel rate={client.rate} incomplete={client.rateIncomplete} />
							</li>
						))}
					</ul>
					<ul className="mt-2 space-y-1">
						{host.targets.map((target) => (
							<li key={target.id}>
								#{host.id} → {target.label}: {flowText(target.kind)} ·{" "}
								{target.lastSeen || flowText("unknown")} ·{" "}
								<FlowRateLabel rate={target.rate} incomplete={target.rateIncomplete} />
							</li>
						))}
					</ul>
				</li>
			))}
		</ul>
	);
}
