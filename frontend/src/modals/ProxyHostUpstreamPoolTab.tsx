import { useFormikContext } from "formik";
import { defaultUpstreamPool, type UpstreamPoolPolicy, type UpstreamTarget } from "src/api/backend/hostTrafficPolicy";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { TabsContent } from "src/components/ui/tabs";
import { useUpstreamPoolStatus } from "src/hooks/useHostTrafficPolicy";
import { T } from "src/locale";

type Values = { forwardScheme?: string; forwardHost?: string; forwardPort?: number; meta?: Record<string, unknown> };
const numericTargets = [
	{ key: "port", min: 1, max: 65535 },
	{ key: "weight", min: 1, max: 1000 },
	{ key: "maxFails", min: 1, max: 10 },
	{ key: "failTimeout", min: 1, max: 300 },
] as const;
const PoolFields = ({ hostId }: { hostId: number | null }) => {
	const { values, setFieldValue } = useFormikContext<Values>();
	const pool = {
		...defaultUpstreamPool(),
		...(values.meta?.upstreamPool as Partial<UpstreamPoolPolicy> | undefined),
	};
	const status = useUpstreamPoolStatus(hostId);
	const update = (patch: Partial<UpstreamPoolPolicy>) => setFieldValue("meta.upstreamPool", { ...pool, ...patch });
	const updateTarget = (index: number, patch: Partial<UpstreamTarget>) =>
		update({ targets: pool.targets.map((item, current) => (current === index ? { ...item, ...patch } : item)) });
	if (!["http", "https"].includes(values.forwardScheme || ""))
		return (
			<p>
				<T id="traffic.http-only" />
			</p>
		);
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Label htmlFor="pool-enabled">
					<T id="traffic.pool.enabled" />
				</Label>
				<Switch id="pool-enabled" checked={pool.enabled} onCheckedChange={(enabled) => update({ enabled })} />
			</div>
			<p className="text-sm text-muted-foreground">
				<T id="traffic.pool.description" />
			</p>
			{pool.targets.map((item, index) => {
				const observed = status.data?.targets.find(
					(row) => row.id === item.id && row.host === item.host && row.port === item.port,
				);
				return (
					<fieldset key={item.id} className="space-y-3 rounded-lg border p-3">
						<legend className="px-1">{item.label || item.id}</legend>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<Label htmlFor={`pool-label-${item.id}`}>
									<T id="name" />
								</Label>
								<Input
									id={`pool-label-${item.id}`}
									value={item.label}
									maxLength={80}
									onChange={(event) => updateTarget(index, { label: event.target.value })}
								/>
							</div>
							<div>
								<Label htmlFor={`pool-host-${item.id}`}>
									<T id="traffic.pool.host" />
								</Label>
								<Input
									id={`pool-host-${item.id}`}
									value={item.host}
									onChange={(event) => updateTarget(index, { host: event.target.value })}
								/>
							</div>
							{numericTargets.map(({ key, min, max }) => (
								<div key={key}>
									<Label htmlFor={`pool-${key}-${item.id}`}>
										<T id={`traffic.pool.${key}`} />
									</Label>
									<Input
										id={`pool-${key}-${item.id}`}
										type="number"
										min={min}
										max={max}
										value={item[key]}
										onChange={(event) => updateTarget(index, { [key]: Number(event.target.value) })}
									/>
								</div>
							))}
						</div>
						<div className="flex items-center gap-3">
							<Switch
								id={`pool-backup-${item.id}`}
								checked={item.backup}
								onCheckedChange={(backup) => updateTarget(index, { backup })}
							/>
							<Label htmlFor={`pool-backup-${item.id}`}>
								<T id="traffic.pool.backup" />
							</Label>
						</div>
						{observed && (
							<p className="text-sm">
								<T id="traffic.pool.observation" />: <T id={`traffic.pool.state.${observed.state}`} /> ·{" "}
								{observed.responseMs} ms · {observed.observedRequests ?? "—"}{" "}
								<T id="traffic.requests" />
							</p>
						)}
						{observed?.monitor && (
							<p className="text-sm">
								<T id="traffic.pool.monitor" />:{" "}
								<T id={`traffic.pool.state.${observed.monitor.state}`} /> ·{" "}
								{observed.monitor.responseMs} ms · {observed.monitor.message}
							</p>
						)}
						<Button
							type="button"
							variant="outline"
							onClick={() => update({ targets: pool.targets.filter((_, current) => current !== index) })}
						>
							<T id="action.delete" />
						</Button>
					</fieldset>
				);
			})}
			<Button
				type="button"
				variant="outline"
				disabled={pool.targets.length >= 16}
				onClick={() =>
					update({
						targets: [
							...pool.targets,
							{
								id: `target-${Date.now()}-${pool.targets.length}`,
								label: `${pool.targets.length + 1}`,
								host: values.forwardHost || "",
								port: values.forwardPort || 80,
								weight: 1,
								backup: false,
								maxFails: 1,
								failTimeout: 10,
							},
						],
					})
				}
			>
				<T id="traffic.pool.add" />
			</Button>
			<div className="grid grid-cols-2 gap-3">
				{(["connectTimeout", "readTimeout"] as const).map((key) => (
					<div key={key}>
						<Label htmlFor={`pool-${key}`}>
							<T id={`traffic.pool.${key}`} />
						</Label>
						<Input
							id={`pool-${key}`}
							type="number"
							min={1}
							max={key === "connectTimeout" ? 60 : 600}
							value={pool[key]}
							onChange={(event) => update({ [key]: Number(event.target.value) })}
						/>
					</div>
				))}
				{(["hostHeader", "tlsServerName"] as const).map((key) => (
					<div key={key}>
						<Label htmlFor={`pool-${key}`}>
							<T id={`traffic.pool.${key}`} />
						</Label>
						<Input
							id={`pool-${key}`}
							value={pool[key] || ""}
							onChange={(event) => update({ [key]: event.target.value })}
						/>
					</div>
				))}
			</div>
			<div className="flex items-center gap-3">
				<Switch
					id="pool-tls-verify"
					checked={pool.tlsVerify}
					onCheckedChange={(tlsVerify) => update({ tlsVerify })}
				/>
				<Label htmlFor="pool-tls-verify">
					<T id="traffic.pool.tls-verify" />
				</Label>
			</div>
			{status.isError && (
				<p role="alert">
					<T id="traffic.status-error" />
				</p>
			)}
		</div>
	);
};
const ProxyHostUpstreamPoolTab = ({ hostId }: { hostId: number | null }) => (
	<TabsContent value="upstream-pool" className="mt-0">
		<PoolFields hostId={hostId} />
	</TabsContent>
);
export default ProxyHostUpstreamPoolTab;
