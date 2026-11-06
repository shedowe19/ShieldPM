import { useQuery } from "@tanstack/react-query";
import { getDatabase } from "src/api/backend/database";
import { DatabaseForm, databaseText, engineName } from "src/components/Database/DatabaseForm";
import { Loading } from "src/components/Loading";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";

export default function DatabaseSettings() {
	const query = useQuery({ queryKey: ["database"], queryFn: getDatabase, retry: false, staleTime: 0 });
	if (query.isLoading) return <Loading noLogo />;
	if (!query.data || query.error)
		return (
			<Alert variant="destructive">
				<AlertDescription>{query.error?.message || databaseText("load-error")}</AlertDescription>
			</Alert>
		);
	const row = query.data;
	const engines = row.supportedTransitions.filter(
		(engine) => engine !== row.engine && (row.engine === "sqlite" || engine === "sqlite"),
	);
	const running = row.operation?.state === "requested" || row.operation?.state === "running";
	return (
		<Card>
			<CardHeader>
				<CardTitle>{databaseText("settings-title")}</CardTitle>
				<CardDescription>{databaseText("settings-description")}</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				<p>
					{row.engine
						? databaseText("current-engine", { engine: engineName(row.engine) })
						: databaseText("not-configured")}
				</p>
				{row.engine && row.engine !== "sqlite" && (
					<p className="text-sm text-muted-foreground">{databaseText("server-transition")}</p>
				)}
				{!row.editable ? (
					<Alert>
						<AlertDescription>{databaseText("not-editable")}</AlertDescription>
					</Alert>
				) : !engines.length ? (
					<p>{databaseText("no-transition")}</p>
				) : (
					<>
						{running && (
							<Alert>
								<AlertDescription>{databaseText("existing-operation")}</AlertDescription>
							</Alert>
						)}
						<DatabaseForm kind="switch" engines={engines} disabled={running} />
					</>
				)}
			</CardContent>
		</Card>
	);
}
