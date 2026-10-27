import { Monitor, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import { useBrowserSessions, useRevokeBrowserSession } from "src/hooks/useBrowserSessions";
import { formatDateTime, T } from "src/locale";

export default function SessionsSettings() {
	const sessions = useBrowserSessions();
	const revoke = useRevokeBrowserSession();
	const [target, setTarget] = useState<string | null | undefined>();
	const date = (value: string | null) => (value ? formatDateTime(value) : <T id="sessions.unknown" />);
	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<div className="flex items-center justify-between gap-4">
						<CardTitle>
							<T id="sessions.title" />
						</CardTitle>
						<Button
							variant="outline"
							size="sm"
							disabled={sessions.isFetching || revoke.isPending}
							onClick={() => void sessions.refetch()}
						>
							<RefreshCw className="mr-2 h-4 w-4" />
							<T id="sessions.refresh" />
						</Button>
					</div>
					<CardDescription>
						<T id="sessions.description" />
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{sessions.isPending ? (
						<p>
							<T id="loading" />
						</p>
					) : sessions.error ? (
						<Alert variant="destructive">
							<AlertDescription>{sessions.error.message}</AlertDescription>
						</Alert>
					) : (
						<>
							<Alert>
								<AlertDescription>
									<T
										id="sessions.access-token-note"
										data={{ minutes: sessions.data?.accessTokenTtlMinutes ?? 15 }}
									/>
								</AlertDescription>
							</Alert>
							{sessions.data?.hasMore && (
								<p className="text-sm text-muted-foreground">
									<T id="sessions.more" />
								</p>
							)}
							{sessions.data?.sessions.length === 0 && (
								<p>
									<T id="sessions.empty" />
								</p>
							)}
							<ul className="space-y-4">
								{sessions.data?.sessions.map((session) => (
									<li key={session.familyId} className="rounded-lg border p-4">
										<div className="mb-3 flex items-center justify-between gap-3">
											<Monitor className="h-5 w-5 shrink-0" aria-hidden="true" />
											{session.current ? (
												<Badge>
													<T id="sessions.current" />
												</Badge>
											) : (
												<Button
													variant="outline"
													size="sm"
													disabled={revoke.isPending}
													onClick={() => {
														revoke.reset();
														setTarget(session.familyId);
													}}
												>
													<T id="sessions.revoke" />
												</Button>
											)}
										</div>
										<dl className="grid gap-2 text-sm sm:grid-cols-[auto_1fr]">
											<dt className="text-muted-foreground">
												<T id="sessions.user-agent" />
											</dt>
											<dd className="break-all">
												{session.userAgent || <T id="sessions.unknown" />}
											</dd>
											<dt className="text-muted-foreground">
												<T id="sessions.ip" />
											</dt>
											<dd>{session.ip || <T id="sessions.unknown" />}</dd>
											<dt className="text-muted-foreground">
												<T id="sessions.started" />
											</dt>
											<dd>{date(session.createdAt)}</dd>
											<dt className="text-muted-foreground">
												<T id="sessions.last-active" />
											</dt>
											<dd>{date(session.lastActiveAt)}</dd>
											<dt className="text-muted-foreground">
												<T id="sessions.expires" />
											</dt>
											<dd>{date(session.expiresAt)}</dd>
										</dl>
									</li>
								))}
							</ul>
							<Button
								variant="destructive"
								disabled={
									revoke.isPending || !sessions.data?.sessions.some((session) => !session.current)
								}
								onClick={() => {
									revoke.reset();
									setTarget(null);
								}}
							>
								<T id="sessions.revoke-others" />
							</Button>
						</>
					)}
				</CardContent>
			</Card>
			<Dialog
				open={target !== undefined}
				onOpenChange={(open) => {
					if (!open && !revoke.isPending) setTarget(undefined);
				}}
			>
				<DialogContent
					onEscapeKeyDown={(event) => {
						if (revoke.isPending) event.preventDefault();
					}}
					onPointerDownOutside={(event) => {
						if (revoke.isPending) event.preventDefault();
					}}
				>
					<DialogHeader>
						<DialogTitle>
							<T id="sessions.confirm-title" />
						</DialogTitle>
						<DialogDescription>
							<T id={target === null ? "sessions.confirm-others" : "sessions.confirm-one"} />
						</DialogDescription>
					</DialogHeader>
					{revoke.error && (
						<Alert variant="destructive">
							<AlertDescription>{revoke.error.message}</AlertDescription>
						</Alert>
					)}
					<DialogFooter>
						<Button variant="outline" disabled={revoke.isPending} onClick={() => setTarget(undefined)}>
							<T id="cancel" />
						</Button>
						<Button
							variant="destructive"
							disabled={revoke.isPending}
							onClick={async () => {
								if (target !== undefined) {
									await revoke
										.mutateAsync(target)
										.then(() => setTarget(undefined))
										.catch(() => {});
								}
							}}
						>
							<T id="confirm" />
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
