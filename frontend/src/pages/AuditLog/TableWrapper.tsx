import { IconHistory, IconSearch } from "@tabler/icons-react";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { LoadingPage } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { useAuditLogs } from "src/hooks";
import { intl, T } from "src/locale";
import { showEventDetailsModal } from "./lazy";
import Table from "./Table";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useAuditLogs(["user"], {}, search.trim());

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return (
			<Alert variant="destructive">
				<AlertCircle className="h-4 w-4" />
				<AlertTitle>
					<T id="error.title" />
				</AlertTitle>
				<AlertDescription>{error?.message || <T id="error.unknown" />}</AlertDescription>
			</Alert>
		);
	}

	return (
		<Card className="mt-4 border-t-4 border-purple-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconHistory className="h-6 w-6" />
					<T id="auditlogs" />
				</CardTitle>
				{data?.length || search !== "" ? (
					<div className="relative w-full max-w-sm">
						<IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							type="search"
							aria-label={intl.formatMessage({ id: "search.placeholder" })}
							placeholder={intl.formatMessage({ id: "search.placeholder" })}
							className="h-9 pl-8"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
					</div>
				) : null}
			</CardHeader>
			<CardContent>
				<Table data={data ?? []} isFetching={isFetching} onSelectItem={showEventDetailsModal} />
			</CardContent>
		</Card>
	);
}
