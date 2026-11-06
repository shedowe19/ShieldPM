import { useState } from "react";
import type { DatabaseEngine, DatabaseTarget } from "src/api/backend/database";
import { setupDatabase, switchDatabase, testDatabase } from "src/api/backend/database";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Checkbox } from "src/components/ui/checkbox";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Switch } from "src/components/ui/switch";
import { intl } from "src/locale";
import { startDatabaseOperation } from "src/modules/DatabaseOperationStore";

export const databaseText = (key: string, values?: Record<string, string | number>) =>
	intl.formatMessage({ id: `database.${key}` }, values);
export const engineName = (engine: DatabaseEngine) =>
	({ sqlite: "SQLite", mysql2: "MySQL / MariaDB", pg: "PostgreSQL" })[engine];
export function DatabaseForm({
	kind,
	engines,
	disabled = false,
}: {
	kind: "setup" | "switch";
	engines: DatabaseEngine[];
	disabled?: boolean;
}) {
	const [target, setTarget] = useState<DatabaseTarget>({
		engine: engines[0] || "sqlite",
		host: "",
		port: engines[0] === "pg" ? 5432 : 3306,
		user: "",
		password: "",
		name: "",
		ssl: false,
	});
	const [tested, setTested] = useState(false);
	const [backup, setBackup] = useState(false);
	const [exclusive, setExclusive] = useState(false);
	const [pending, setPending] = useState<"test" | "start" | null>(null);
	const [error, setError] = useState<string | null>(null);
	const change = (patch: Partial<DatabaseTarget>) => {
		setTarget({ ...target, ...patch });
		setTested(false);
		setError(null);
		setBackup(false);
		setExclusive(false);
	};
	const payload = (): DatabaseTarget =>
		target.engine === "sqlite"
			? { engine: "sqlite" }
			: { ...target, host: target.host?.trim(), user: target.user?.trim(), name: target.name?.trim() };
	const valid =
		engines.includes(target.engine) &&
		(target.engine === "sqlite" ||
			Boolean(
				target.host?.trim() &&
					target.user?.trim() &&
					target.name?.trim() &&
					target.port &&
					Number.isInteger(target.port) &&
					target.port > 0 &&
					target.port <= 65535,
			));
	const test = async () => {
		if (!valid || pending) return;
		setError(null);
		setTested(false);
		setPending("test");
		try {
			const result = await testDatabase(payload());
			setTested(result.ok === true);
			if (!result.ok) setError(databaseText("test-failed"));
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : databaseText("test-failed"));
		} finally {
			setPending(null);
		}
	};
	const start = async () => {
		if (pending || !tested || !valid || (kind === "switch" && (!backup || !exclusive))) return;
		setError(null);
		setPending("start");
		try {
			const result = await (kind === "setup" ? setupDatabase(payload()) : switchDatabase(payload()));
			// Never retain connection passwords after the request has been accepted.
			setTarget({ engine: target.engine });
			startDatabaseOperation(result, kind, target.engine);
		} catch (failure) {
			setError(failure instanceof Error ? failure.message : databaseText("start-failed"));
			setTested(false);
		} finally {
			setPending(null);
		}
	};
	return (
		<div className="space-y-6">
			{error && (
				<Alert variant="destructive">
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}
			<fieldset className="space-y-4" disabled={disabled || Boolean(pending)}>
				<div className="space-y-2">
					<Label htmlFor="database-engine">{databaseText("engine")}</Label>
					<Select
						value={target.engine}
						onValueChange={(engine: DatabaseEngine) =>
							change({ engine, password: "", port: engine === "pg" ? 5432 : 3306 })
						}
						disabled={disabled || Boolean(pending)}
					>
						<SelectTrigger id="database-engine">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{engines.map((engine) => (
								<SelectItem key={engine} value={engine}>
									{engineName(engine)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				{target.engine === "sqlite" ? (
					<p className="text-sm text-muted-foreground">{databaseText("sqlite-help")}</p>
				) : (
					<>
						<div className="space-y-2">
							<Label htmlFor="database-host">{databaseText("host")}</Label>
							<Input
								id="database-host"
								value={target.host || ""}
								autoComplete="off"
								onChange={(event) => change({ host: event.target.value })}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="database-port">{databaseText("port")}</Label>
							<Input
								id="database-port"
								type="number"
								min={1}
								max={65535}
								value={target.port || ""}
								onChange={(event) => change({ port: Number(event.target.value) })}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="database-name">{databaseText("name")}</Label>
							<Input
								id="database-name"
								value={target.name || ""}
								autoComplete="off"
								onChange={(event) => change({ name: event.target.value })}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="database-user">{databaseText("user")}</Label>
							<Input
								id="database-user"
								value={target.user || ""}
								autoComplete="off"
								onChange={(event) => change({ user: event.target.value })}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="database-password">{databaseText("password")}</Label>
							<Input
								id="database-password"
								type="password"
								value={target.password || ""}
								autoComplete="new-password"
								onChange={(event) => change({ password: event.target.value })}
							/>
						</div>
						<div className="flex items-center justify-between gap-4">
							<Label htmlFor="database-ssl">{databaseText("ssl")}</Label>
							<Switch
								id="database-ssl"
								checked={Boolean(target.ssl)}
								disabled={disabled || Boolean(pending)}
								onCheckedChange={(ssl) => change({ ssl })}
							/>
						</div>
					</>
				)}
				<p className="text-sm text-muted-foreground">{databaseText("empty-target")}</p>
				{kind === "switch" && (
					<>
						<Alert>
							<AlertDescription>{databaseText("conversion-notice")}</AlertDescription>
						</Alert>
						<div className="flex items-start gap-2">
							<Checkbox
								id="database-backup"
								checked={backup}
								onCheckedChange={(checked) => setBackup(checked === true)}
								disabled={disabled || Boolean(pending)}
							/>
							<Label htmlFor="database-backup">{databaseText("confirm-backup")}</Label>
						</div>
						<div className="flex items-start gap-2">
							<Checkbox
								id="database-exclusive"
								checked={exclusive}
								onCheckedChange={(checked) => setExclusive(checked === true)}
								disabled={disabled || Boolean(pending)}
							/>
							<Label htmlFor="database-exclusive">{databaseText("confirm-exclusive")}</Label>
						</div>
					</>
				)}
			</fieldset>
			{tested && <p role="status">{databaseText("tested")}</p>}
			<div className="flex flex-wrap gap-2">
				<Button variant="outline" onClick={() => void test()} disabled={disabled || Boolean(pending) || !valid}>
					{databaseText(pending === "test" ? "testing" : "test")}
				</Button>
				<Button
					className="h-auto max-w-full whitespace-normal"
					onClick={() => void start()}
					disabled={
						disabled ||
						Boolean(pending) ||
						!valid ||
						!tested ||
						(kind === "switch" && (!backup || !exclusive))
					}
				>
					{databaseText(pending === "start" ? "starting" : kind === "setup" ? "setup" : "convert")}
				</Button>
			</div>
		</div>
	);
}
