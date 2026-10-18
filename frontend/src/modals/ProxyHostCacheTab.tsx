import { useFormikContext } from "formik";
import { useState } from "react";
import { type CachePolicy, defaultCachePolicy } from "src/api/backend/hostTrafficPolicy";
import { HasPermission } from "src/components/HasPermission";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { TabsContent } from "src/components/ui/tabs";
import { useHostCacheStatus, usePurgeHostCache } from "src/hooks/useHostTrafficPolicy";
import { T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";

type Values = { forwardScheme?: string; cachingEnabled?: boolean; meta?: Record<string, unknown> };
const CacheFields = ({ hostId }: { hostId: number | null }) => {
	const { values, setFieldValue } = useFormikContext<Values>();
	const policy = {
		...defaultCachePolicy(values.cachingEnabled),
		...(values.meta?.cachePolicy as Partial<CachePolicy> | undefined),
	};
	const update = (patch: Partial<CachePolicy>) => setFieldValue("meta.cachePolicy", { ...policy, ...patch });
	const status = useHostCacheStatus(hostId);
	const purge = usePurgeHostCache(hostId);
	const [purgePath, setPurgePath] = useState("");
	if (!["http", "https"].includes(values.forwardScheme || ""))
		return (
			<p>
				<T id="traffic.http-only" />
			</p>
		);
	return (
		<div className="space-y-4">
			<div className="flex items-center justify-between">
				<Label htmlFor="cache-enabled">
					<T id="traffic.cache.enabled" />
				</Label>
				<Switch
					id="cache-enabled"
					checked={policy.enabled}
					onCheckedChange={(enabled) => {
						update({ enabled });
						setFieldValue("cachingEnabled", enabled);
					}}
				/>
			</div>
			<p className="text-sm text-muted-foreground">
				<T id="traffic.cache.description" />
			</p>
			<div className="flex items-center gap-3">
				<Switch
					id="cache-assets-only"
					checked={policy.assetsOnly}
					onCheckedChange={(assetsOnly) =>
						update({ assetsOnly, cacheKey: assetsOnly ? policy.cacheKey : "uri" })
					}
				/>
				<Label htmlFor="cache-assets-only">
					<T id="traffic.cache.assets-only" />
				</Label>
			</div>
			<div className="grid grid-cols-2 gap-3">
				{(["maxSizeMb", "inactiveSeconds"] as const).map((key) => (
					<div key={key}>
						<Label htmlFor={`cache-${key}`}>
							<T id={`traffic.cache.${key}`} />
						</Label>
						<Input
							id={`cache-${key}`}
							type="number"
							min={key === "maxSizeMb" ? 16 : 60}
							max={key === "maxSizeMb" ? 10240 : 604800}
							value={policy[key]}
							onChange={(event) => update({ [key]: Number(event.target.value) })}
						/>
					</div>
				))}
			</div>
			<div className="flex items-center gap-3">
				<Switch
					id="cache-ignore-query"
					checked={policy.cacheKey === "uri_ignore_query"}
					onCheckedChange={(checked) =>
						update({
							cacheKey: checked ? "uri_ignore_query" : "uri",
							assetsOnly: checked ? true : policy.assetsOnly,
						})
					}
				/>
				<Label htmlFor="cache-ignore-query">
					<T id="traffic.cache.ignore-query" />
				</Label>
			</div>
			{policy.routes.map((route, index) => (
				<div key={`${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-3 items-end">
					<div>
						<Label htmlFor={`cache-route-${index}`}>
							<T id="traffic.cache.route" />
						</Label>
						<Input
							id={`cache-route-${index}`}
							maxLength={256}
							value={route.path}
							onChange={(event) =>
								update({
									routes: policy.routes.map((item, current) =>
										current === index ? { ...item, path: event.target.value } : item,
									),
								})
							}
						/>
					</div>
					<div>
						<Label htmlFor={`cache-ttl-${index}`}>
							<T id="traffic.cache.ttl" />
						</Label>
						<Input
							id={`cache-ttl-${index}`}
							type="number"
							min={1}
							max={86400}
							value={route.ttlSeconds}
							onChange={(event) =>
								update({
									routes: policy.routes.map((item, current) =>
										current === index ? { ...item, ttlSeconds: Number(event.target.value) } : item,
									),
								})
							}
						/>
					</div>
					<Button
						type="button"
						variant="outline"
						disabled={policy.routes.length === 1}
						onClick={() => update({ routes: policy.routes.filter((_, current) => current !== index) })}
					>
						<T id="action.delete" />
					</Button>
				</div>
			))}
			<Button
				type="button"
				variant="outline"
				disabled={policy.routes.length >= 16}
				onClick={() =>
					update({ routes: [...policy.routes, { path: "/assets/", ttlSeconds: policy.ttlSeconds }] })
				}
			>
				<T id="traffic.cache.add-route" />
			</Button>
			{hostId && (
				<div className="space-y-3 rounded-lg border p-3">
					<p>
						<T id="traffic.cache.hit-ratio" />:{" "}
						{status.data?.hitRatio === null || !status.data
							? "—"
							: `${(status.data.hitRatio * 100).toFixed(1)}%`}{" "}
						· {status.data?.sampleRequests || 0} <T id="traffic.requests" />
					</p>
					<p className="text-xs text-muted-foreground">
						<T id="traffic.cache.sample" />
					</p>
					{status.data?.protectedBypass && (
						<p>
							<T id="traffic.cache.protected" />
						</p>
					)}
					<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
						<Label htmlFor="cache-purge-path">
							<T id="traffic.cache.purge-path" />
						</Label>
						<Input
							id="cache-purge-path"
							value={purgePath}
							placeholder="/assets/app.js"
							onChange={(event) => setPurgePath(event.target.value)}
						/>
						<Button
							type="button"
							variant="outline"
							disabled={purge.isPending}
							onClick={() => purge.mutate(purgePath || undefined)}
						>
							<T id="traffic.cache.purge" />
						</Button>
					</HasPermission>
					{purge.isSuccess && (
						<p role="status">
							<T id="traffic.cache.purged" />: {purge.data.removed}
						</p>
					)}
					{(purge.isError || status.isError) && (
						<p role="alert">
							<T id="traffic.status-error" />
						</p>
					)}
				</div>
			)}
		</div>
	);
};
const ProxyHostCacheTab = ({ hostId }: { hostId: number | null }) => (
	<TabsContent value="cache" className="mt-0">
		<CacheFields hostId={hostId} />
	</TabsContent>
);
export default ProxyHostCacheTab;
