import { IconHelp, IconSearch, IconPlus, IconShieldLock } from "@tabler/icons-react";
import { useState } from "react";
import { deleteAccessList } from "src/api/backend";
import { HasPermission, LoadingPage } from "src/components";
import { useAccessLists } from "src/hooks";
import { intl, T } from "src/locale";
import { showAccessListModal, showDeleteConfirmModal, showHelpModal } from "src/modals";
import { ACCESS_LISTS, MANAGE } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Button } from "src/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useAccessLists(["owner", "items", "clients"]);

	if (isLoading) {
		return <LoadingPage />;
	}

	if (isError) {
		return (
			<Alert variant="destructive">
				<AlertCircle className="h-4 w-4" />
				<AlertTitle>Error</AlertTitle>
				<AlertDescription>{error?.message || <T id="error.unknown" />}</AlertDescription>
			</Alert>
		);
	}

	const handleDelete = async (id: number) => {
		await deleteAccessList(id);
		showObjectSuccess("access-list", "deleted");
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return item.name.toLowerCase().includes(search);
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<Card className="mt-4 border-t-4 border-cyan-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconShieldLock className="h-6 w-6" />
					<T id="access-lists" />
				</CardTitle>
				<div className="flex items-center space-x-2">
					{data?.length ? (
						<div className="relative w-full max-w-sm">
							<IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
							<Input
								type="search"
								placeholder={intl.formatMessage({ id: "search.placeholder" })}
								className="pl-8 h-9"
								onChange={(e) => setSearch(e.target.value.toLowerCase().trim())}
							/>
						</div>
					) : null}
					<Button variant="outline" size="icon" onClick={() => showHelpModal("AccessLists", "cyan")}>
						<IconHelp className="h-4 w-4" />
					</Button>
					<HasPermission section={ACCESS_LISTS} permission={MANAGE} hideError>
						{data?.length ? (
							<Button
								size="sm"
								className="bg-cyan-600/90 hover:bg-cyan-600 text-white shadow-sm"
								onClick={() => showAccessListModal("new")}
							>
								<IconPlus className="mr-2 h-4 w-4" />
								<T id="object.add" tData={{ object: "access-list" }} />
							</Button>
						) : null}
					</HasPermission>
				</div>
			</CardHeader>
			<CardContent>
				<Table
					data={filtered ?? data ?? []}
					isFetching={isFetching}
					isFiltered={!!filtered}
					onEdit={(id: number) => showAccessListModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "access-list" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["access-lists"], ["access-list", id]],
							children: <T id="object.delete.content" tData={{ object: "access-list" }} />,
						})
					}
					onNew={() => showAccessListModal("new")}
				/>
			</CardContent>
		</Card>
	);
}
