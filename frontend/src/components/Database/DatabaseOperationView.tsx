import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { acknowledgeDatabaseFailure, getDatabase, getDatabaseOperation } from "src/api/backend/database";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { useHealth } from "src/hooks/useHealth";
import { usePollingEnvironment } from "src/hooks/usePollingEnvironment";
import {
	acknowledgeDatabaseRecovery,
	clearDatabaseOperation,
	recordDatabaseOperation,
	useDatabaseOperation,
} from "src/modules/DatabaseOperationStore";
import { databaseText, engineName } from "./DatabaseForm";

const compatibilityErrors = new Set([
	"DB_INCOMPATIBLE",
	"DB_VALUE_INCOMPATIBLE",
	"DB_VALUE_OUT_OF_RANGE",
	"DB_CONSTRAINT_INCOMPATIBLE",
]);
const isNormalDatabaseHealth = (row?: {
	status: string;
	databaseMaintenance?: boolean;
	databaseSetupRequired?: boolean;
}) => row?.status === "OK" && !row.databaseMaintenance && !row.databaseSetupRequired;
const phases = new Set(["requested", "preparing", "copying", "verified", "activating", "activated", "completed"]);
export default function DatabaseOperationView() {
	const job = useDatabaseOperation();
	const client = useQueryClient();
	const [acknowledging, setAcknowledging] = useState(false);
	const [recoveryError, setRecoveryError] = useState(false);
	const [inspecting, setInspecting] = useState(false);
	const [inspectionError, setInspectionError] = useState(false);
	const environment = usePollingEnvironment();
	const active = environment.isOnline && environment.isDocumentVisible;
	const health = useHealth({ retry: false, refetchInterval: active ? 2000 : false });
	const query = useQuery({
		queryKey: ["database-operation", job?.id],
		queryFn: ({ signal }) => getDatabaseOperation(job?.id || "", job?.token || "", signal),
		enabled: active && Boolean(job?.token) && job?.result?.state !== "failed",
		retry: false,
		staleTime: 0,
		gcTime: 0,
		refetchInterval: (current) =>
			active && job?.token && job?.result?.state !== "failed"
				? Math.min(15_000, 1000 * 2 ** Math.min(current.state.fetchFailureCount, 4))
				: false,
	});
	useEffect(() => {
		if (query.data) recordDatabaseOperation(query.data);
	}, [query.data]);
	const result = job?.result;
	const terminal = result?.state === "completed" || result?.state === "failed";
	const ready =
		terminal &&
		!health.isError &&
		health.data?.status === "OK" &&
		!health.data.databaseMaintenance &&
		(!health.data.databaseSetupRequired || (job?.recovered && job.kind === "setup")) &&
		(!result?.canCancel || job?.recovered);
	const recover = async () => {
		if (!job?.token || !result?.canCancel || acknowledging) return;
		setAcknowledging(true);
		setRecoveryError(false);
		try {
			await acknowledgeDatabaseFailure(job.id, job.token);
			acknowledgeDatabaseRecovery();
			await health.refetch();
		} catch {
			setRecoveryError(true);
		} finally {
			setAcknowledging(false);
		}
	};
	const finish = () => {
		client.removeQueries({ queryKey: ["database"] });
		clearDatabaseOperation();
		void client.invalidateQueries({ queryKey: ["health"] });
	};

	const inspectCurrentDatabase = async () => {
		if (inspecting) return;
		setInspecting(true);
		setInspectionError(false);
		try {
			const fresh = await health.refetch();
			if (fresh.isError || !fresh.data || !isNormalDatabaseHealth(fresh.data)) throw new Error("unconfirmed");
			// A healthy initialized installation without an account has no admin credentials yet.
			if (fresh.data.setup !== false) {
				const database = await getDatabase();
				if (
					!database.configured ||
					!database.engine ||
					!["sqlite", "mysql2", "pg"].includes(database.engine) ||
					database.operation?.state === "requested" ||
					database.operation?.state === "running"
				)
					throw new Error("unconfirmed");
			}
			finish();
		} catch {
			setInspectionError(true);
		} finally {
			setInspecting(false);
		}
	};
	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4">
			<Card className="w-full max-w-xl">
				<CardHeader>
					<CardTitle>
						{databaseText(job?.kind === "setup" ? "setup-progress" : "conversion-progress")}
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					{job && <p>{databaseText("target-engine", { engine: engineName(job.targetEngine) })}</p>}
					<p role="status">
						{databaseText(
							job?.recovered
								? "recovery-acknowledged"
								: result?.state === "failed"
									? "operation-failed"
									: result?.state === "completed"
										? ready
											? "operation-completed"
											: "waiting-restart"
										: "operation-running",
						)}
					</p>
					{result && (
						<p className="text-sm text-muted-foreground">
							{databaseText(`phase.${phases.has(result.phase) ? result.phase : "working"}`)}
						</p>
					)}
					{result?.progress?.table && (
						<p className="text-sm">{databaseText("copy-table", { table: result.progress.table })}</p>
					)}
					{recoveryError && (
						<Alert variant="destructive">
							<AlertDescription>{databaseText("recovery-failed")}</AlertDescription>
						</Alert>
					)}
					{result?.error && (
						<Alert variant="destructive">
							<AlertDescription>
								{result.errorCode && compatibilityErrors.has(result.errorCode) && (
									<p>{databaseText(`error.${result.errorCode}`)}</p>
								)}
								{result.error}
							</AlertDescription>
						</Alert>
					)}
					{(query.isError || !active) && (
						<Alert>
							<AlertDescription>{databaseText("connection-wait")}</AlertDescription>
						</Alert>
					)}
					<p className="text-sm text-muted-foreground">{databaseText("restart-help")}</p>
					{result?.state === "failed" && <p className="text-sm">{databaseText("failure-help")}</p>}
					<Button variant="outline" onClick={() => void health.refetch()}>
						{databaseText("check-status")}
					</Button>
					{result?.state === "failed" && result.canCancel && !job?.recovered && (
						<Button
							className="h-auto max-w-full whitespace-normal"
							disabled={acknowledging}
							onClick={() => void recover()}
						>
							{databaseText(job?.kind === "setup" ? "acknowledge-setup-failure" : "acknowledge-failure")}
						</Button>
					)}
					{query.isError && !health.isError && isNormalDatabaseHealth(health.data) && (
						<div className="space-y-2">
							<p className="text-sm">{databaseText("inspect-help")}</p>
							{inspectionError && (
								<Alert variant="destructive">
									<AlertDescription>{databaseText("inspect-failed")}</AlertDescription>
								</Alert>
							)}
							<Button
								className="h-auto max-w-full whitespace-normal"
								disabled={inspecting}
								onClick={() => void inspectCurrentDatabase()}
							>
								{databaseText(inspecting ? "inspecting" : "inspect-current")}
							</Button>
						</div>
					)}
					{terminal && (
						<Button onClick={finish} disabled={!ready}>
							{databaseText(job?.recovered && job.kind === "setup" ? "choose-again" : "continue")}
						</Button>
					)}
				</CardContent>
			</Card>
		</div>
	);
}

export function DatabaseMaintenance() {
	const health = useHealth();
	return (
		<div className="flex min-h-screen items-center justify-center bg-background p-4">
			<Card className="w-full max-w-xl">
				<CardHeader>
					<CardTitle>{databaseText("maintenance-title")}</CardTitle>
				</CardHeader>
				<CardContent className="space-y-4">
					<p role="status">{databaseText("maintenance-help")}</p>
					<p className="text-sm text-muted-foreground">{databaseText("restart-help")}</p>
					<Button onClick={() => void health.refetch()}>{databaseText("check-status")}</Button>
				</CardContent>
			</Card>
		</div>
	);
}
