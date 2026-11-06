import { useState } from "react";
import type { TrafficFlowConfig } from "src/api/backend/trafficFlowSettings";
import { Loading } from "src/components/Loading";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Switch } from "src/components/ui/switch";
import { useTrafficFlowSettings } from "src/hooks/useTrafficFlowSettings";
import { intl } from "src/locale";

const text = (key: string) => intl.formatMessage({ id: `settings.traffic-flow.${key}` });
export default function TrafficFlowSettings() {
	const { query, save } = useTrafficFlowSettings();
	const [draft, setDraft] = useState<TrafficFlowConfig | null>(null);
	const [saved, setSaved] = useState(false);
	if (query.isLoading) return <Loading noLogo />;
	if (!query.data)
		return (
			<Alert variant="destructive">
				<AlertDescription>{query.error?.message || text("load-error")}</AlertDescription>
			</Alert>
		);
	const values = draft || query.data.meta;
	const change = (patch: Partial<TrafficFlowConfig>) => {
		setDraft({ ...values, ...patch });
		setSaved(false);
		save.reset();
	};
	const submit = async () => {
		if (save.isPending) return;
		setSaved(false);
		try {
			await save.mutateAsync(values);
			setDraft(null);
			setSaved(true);
		} catch {
			/* Mutation error remains visible; keep the unsaved draft. */
		}
	};
	return (
		<Card>
			<CardHeader>
				<CardTitle>{text("title")}</CardTitle>
				<CardDescription>{text("description")}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{(query.error || save.error) && (
					<Alert variant="destructive">
						<AlertDescription>{save.error?.message || query.error?.message}</AlertDescription>
					</Alert>
				)}
				{saved && <p role="status">{text("saved")}</p>}
				{query.data.meta.enabled && query.data.meta.liveEnabled && !query.data.runtime.liveEffective && (
					<Alert>
						<AlertDescription>
							{text(
								query.data.runtime.reason === "configuration_failed"
									? "configuration-failed"
									: !query.data.runtime.nativeAvailable
										? "native-unavailable"
										: "runtime-inactive",
							)}
						</AlertDescription>
					</Alert>
				)}
				<fieldset className="space-y-6" disabled={save.isPending}>
					<div className="space-y-2">
						<div className="flex items-center justify-between gap-4">
							<Label htmlFor="flow-enabled">{text("enabled")}</Label>
							<Switch
								id="flow-enabled"
								checked={values.enabled}
								onCheckedChange={(enabled) => change({ enabled })}
								disabled={save.isPending}
							/>
						</div>
						<p className="text-sm text-muted-foreground">{text("enabled-help")}</p>
					</div>
					<div className="space-y-2">
						<div className="flex items-center justify-between gap-4">
							<Label htmlFor="flow-live">{text("live-enabled")}</Label>
							<Switch
								id="flow-live"
								checked={values.liveEnabled}
								onCheckedChange={(liveEnabled) => change({ liveEnabled })}
								disabled={!values.enabled || save.isPending}
							/>
						</div>
						<p className="text-sm text-muted-foreground">{text("live-help")}</p>
					</div>
					<div className="space-y-2">
						<Label htmlFor="flow-client-mode">{text("client-mode")}</Label>
						<Select
							value={values.clientMode}
							onValueChange={(clientMode: "prefix" | "address" | "hidden") => change({ clientMode })}
							disabled={save.isPending}
						>
							<SelectTrigger id="flow-client-mode">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="prefix">{text("prefix")}</SelectItem>
								<SelectItem value="address">{text("address")}</SelectItem>
								<SelectItem value="hidden">{text("hidden")}</SelectItem>
							</SelectContent>
						</Select>
						<p className="text-sm text-muted-foreground">{text("privacy")}</p>
					</div>
					{values.clientMode === "address" && (
						<Alert>
							<AlertDescription>{text("address-notice")}</AlertDescription>
						</Alert>
					)}
				</fieldset>
				<div className="flex flex-wrap gap-2">
					<Button onClick={() => void submit()} disabled={save.isPending}>
						{text(save.isPending ? "saving" : "save")}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}
