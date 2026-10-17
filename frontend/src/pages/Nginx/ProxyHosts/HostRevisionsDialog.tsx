import { useState } from "react";
import { HasPermission } from "src/components/HasPermission";
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
import { useHostRevisionPlan, useHostRevisions, useRestoreHostRevision } from "src/hooks/useHostRevisions";
import { formatDateTime, T } from "src/locale";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";

export function HostRevisionsDialog({
	hostId,
	domain,
	onClose,
}: {
	hostId: number;
	domain: string;
	onClose: () => void;
}) {
	const [selected, setSelected] = useState<number | null>(null);
	const revisions = useHostRevisions(hostId);
	const plan = useHostRevisionPlan(hostId, selected);
	const restore = useRestoreHostRevision(hostId);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open && !restore.isPending) onClose();
			}}
		>
			<DialogContent
				className="max-h-[90vh] max-w-4xl overflow-y-auto"
				onEscapeKeyDown={(event) => {
					if (restore.isPending) event.preventDefault();
				}}
				onPointerDownOutside={(event) => {
					if (restore.isPending) event.preventDefault();
				}}
			>
				<DialogHeader>
					<DialogTitle>
						<T id="proxy-host.revisions.title" />
					</DialogTitle>
					<DialogDescription>{domain}</DialogDescription>
				</DialogHeader>
				{revisions.isPending ? (
					<p>
						<T id="loading" />
					</p>
				) : revisions.error ? (
					<Alert variant="destructive">
						<AlertDescription>{revisions.error.message}</AlertDescription>
					</Alert>
				) : revisions.data?.length === 0 ? (
					<p>
						<T id="proxy-host.revisions.empty" />
					</p>
				) : (
					<div className="grid gap-4 md:grid-cols-[220px_1fr]">
						<div className="space-y-2">
							<h3 className="font-medium">
								<T id="proxy-host.revisions.versions" />
							</h3>
							<ul className="max-h-80 space-y-1 overflow-auto">
								{revisions.data?.map((revision) => (
									<li key={revision.id}>
										<Button
											type="button"
											variant={selected === revision.id ? "secondary" : "ghost"}
											className="h-auto w-full flex-col items-start whitespace-normal text-left"
											disabled={restore.isPending}
											onClick={() => {
												restore.reset();
												setSelected(revision.id);
											}}
										>
											<span>
												#{revision.id} · {formatDateTime(revision.createdOn)}
											</span>
											<span className="text-xs text-muted-foreground">
												{revision.action} ·{" "}
												<T
													id="proxy-host.revisions.actor"
													data={{ id: revision.actorUserId ?? "–" }}
												/>
											</span>
										</Button>
									</li>
								))}
							</ul>
						</div>
						<div className="min-w-0 space-y-3">
							{selected === null ? (
								<p>
									<T id="proxy-host.revisions.select" />
								</p>
							) : plan.isPending ? (
								<p>
									<T id="loading" />
								</p>
							) : plan.error ? (
								<Alert variant="destructive">
									<AlertDescription>{plan.error.message}</AlertDescription>
								</Alert>
							) : plan.data ? (
								<>
									<p className="text-sm text-muted-foreground">
										<T id="proxy-host.revisions.description" />
									</p>
									{plan.data.changes.length === 0 ? (
										<p>
											<T id="proxy-host.revisions.no-changes" />
										</p>
									) : (
										<div className="max-h-96 overflow-auto">
											<table className="w-full text-sm">
												<thead>
													<tr>
														<th className="text-left">
															<T id="proxy-host.revisions.field" />
														</th>
														<th className="text-left">
															<T id="proxy-host.revisions.current" />
														</th>
														<th className="text-left">
															<T id="proxy-host.revisions.target" />
														</th>
													</tr>
												</thead>
												<tbody>
													{plan.data.changes.map((change) => (
														<tr key={change.field} className="border-t">
															<th className="p-2 text-left align-top font-mono">
																{change.field}
															</th>
															<td className="max-w-56 break-all p-2 align-top">
																<pre className="whitespace-pre-wrap">
																	{JSON.stringify(change.before, null, 2)}
																</pre>
															</td>
															<td className="max-w-56 break-all p-2 align-top">
																<pre className="whitespace-pre-wrap">
																	{JSON.stringify(change.after, null, 2)}
																</pre>
															</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									)}
									<HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
										<Button
											type="button"
											disabled={
												restore.isPending || plan.isFetching || plan.data.changes.length === 0
											}
											onClick={() => {
												if (plan.data && selected !== null)
													restore.mutate({
														revisionId: selected,
														fingerprint: plan.data.expectedFingerprint,
													});
											}}
										>
											<T id={restore.isPending ? "loading" : "proxy-host.revisions.restore"} />
										</Button>
									</HasPermission>
								</>
							) : null}
							{restore.error && (
								<Alert variant="destructive">
									<AlertDescription>{restore.error.message}</AlertDescription>
								</Alert>
							)}
							{restore.isSuccess && (
								<p role="status">
									<T id="proxy-host.revisions.restored" />
								</p>
							)}
						</div>
					</div>
				)}
				<DialogFooter>
					<Button type="button" variant="outline" disabled={restore.isPending} onClick={onClose}>
						<T id="action.close" />
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
