import { useEffect, useState } from "react";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { FlowRateLegend } from "./TrafficFlowRate";
import { flowText, TrafficFlowList, TrafficFlowRows } from "./TrafficFlowRows";
import { useTrafficFlow } from "./useTrafficFlow";

function TrafficFlowContent() {
	const [paused, setPaused] = useState(false);
	const [list, setList] = useState(false);
	const [search, setSearch] = useState("");
	const [now, setNow] = useState(Date.now);
	const { data, error, isLoading, available } = useTrafficFlow(paused);
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(timer);
	}, []);
	const age = data ? Math.max(0, Math.floor((now - Date.parse(data.generatedAt)) / 1000)) : 0;
	const stale = age > (data?.capabilities.currentRates ? 5 : 15);
	const hosts = [...(data?.hosts || [])]
		.filter((host) => `${host.id} ${host.domains.join(" ")}`.toLowerCase().includes(search.toLowerCase()))
		.sort((a, b) => a.id - b.id);
	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				{flowText(data?.capabilities.currentRates ? "live-semantics" : "limitation")}
			</p>
			<p className="text-sm text-muted-foreground">{flowText("privacy")}</p>
			<div className="flex flex-wrap items-center gap-2">
				<Button variant="outline" size="sm" onClick={() => setPaused(!paused)}>
					{flowText(paused ? "resume" : "pause")}
				</Button>
				<Button variant="outline" size="sm" aria-pressed={list} onClick={() => setList(!list)}>
					{flowText(list ? "diagram" : "list")}
				</Button>
				<Input
					className="max-w-xs"
					aria-label={flowText("search")}
					placeholder={flowText("search")}
					value={search}
					onChange={(event) => setSearch(event.target.value)}
				/>
			</div>
			<div className="text-sm" role="status">
				{flowText(paused ? "paused" : !available ? "offline" : stale ? "stale" : "refreshing")}
				{data && <> · {flowText("age", { seconds: age })}</>}
			</div>
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{flowText("error")}</AlertDescription>
				</Alert>
			)}
			{isLoading && <p>{flowText("loading")}</p>}
			{data && !error && !data.enabled && <p>{flowText("disabled")}</p>}
			{data?.enabled && !error && (
				<>
					<p className="text-sm">{flowText(`collector-${data.collector.state}`)}</p>
					<p className="text-xs text-muted-foreground">
						{flowText("window", { start: data.window.start, end: data.window.end })}
					</p>
					{(data.truncated || hosts.some((host) => host.truncated)) && (
						<Alert>
							<AlertDescription>{flowText("truncated")}</AlertDescription>
						</Alert>
					)}
					<p className="text-sm">{flowText("legend")}</p>
					{data.capabilities.currentRates && <FlowRateLegend />}
					{hosts.length === 0 ? (
						<p>{flowText("empty")}</p>
					) : list ? (
						<TrafficFlowList hosts={hosts} />
					) : (
						<TrafficFlowRows hosts={hosts} snapshot={data} />
					)}
				</>
			)}
		</div>
	);
}

export function TrafficFlow() {
	const [open, setOpen] = useState(false);
	return (
		<Card>
			<CardHeader>
				<CardTitle>{flowText("title")}</CardTitle>
				<CardDescription>{flowText("description")}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<Button variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>
					{flowText(open ? "close" : "open")}
				</Button>
				{open && <TrafficFlowContent />}
			</CardContent>
		</Card>
	);
}
