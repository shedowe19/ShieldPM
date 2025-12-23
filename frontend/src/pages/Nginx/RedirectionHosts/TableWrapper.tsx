import { IconHelp, IconSearch, IconPlus, IconRoute } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { deleteRedirectionHost, toggleRedirectionHost } from "src/api/backend";
import { HasPermission, LoadingPage } from "src/components";
import { useRedirectionHosts } from "src/hooks";
import { intl, T } from "src/locale";
import { showDeleteConfirmModal, showHelpModal, showRedirectionHostModal } from "src/modals";
import { MANAGE, REDIRECTION_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { Button } from "src/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { AlertCircle } from "lucide-react";

export default function TableWrapper() {
	const queryClient = useQueryClient();
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useRedirectionHosts(["owner", "certificate"]);

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
		await deleteRedirectionHost(id);
		showObjectSuccess("redirection-host", "deleted");
	};

	const handleDisableToggle = async (id: number, enabled: boolean) => {
		await toggleRedirectionHost(id, enabled);
		queryClient.invalidateQueries({ queryKey: ["redirection-hosts"] });
		queryClient.invalidateQueries({ queryKey: ["redirection-host", id] });
		showObjectSuccess("redirection-host", enabled ? "enabled" : "disabled");
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter((item) => {
			return (
				item.domainNames.some((domain: string) => domain.toLowerCase().includes(search)) ||
				item.forwardDomainName.toLowerCase().includes(search)
			);
		});
	} else if (search !== "") {
		// this can happen if someone deletes the last item while searching
		setSearch("");
	}

	return (
		<Card className="mt-4 border-t-4 border-yellow-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconRoute className="h-6 w-6" />
					<T id="redirection-hosts" />
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
					<Button variant="outline" size="icon" onClick={() => showHelpModal("RedirectionHosts", "yellow")}>
						<IconHelp className="h-4 w-4" />
					</Button>
					<HasPermission section={REDIRECTION_HOSTS} permission={MANAGE} hideError>
						{data?.length ? (
							<Button
								size="sm"
								className="bg-yellow-600/90 hover:bg-yellow-600 text-white shadow-sm"
								onClick={() => showRedirectionHostModal("new")}
							>
								<IconPlus className="mr-2 h-4 w-4" />
								<T id="object.add" tData={{ object: "redirection-host" }} />
							</Button>
						) : null}
					</HasPermission>
				</div>
			</CardHeader>
			<CardContent>
				<Table
					data={filtered ?? data ?? []}
					isFiltered={!!search}
					isFetching={isFetching}
					onEdit={(id: number) => showRedirectionHostModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: <T id="object.delete" tData={{ object: "redirection-host" }} />,
							onConfirm: () => handleDelete(id),
							invalidations: [["redirection-hosts"], ["redirection-host", id]],
							children: <T id="object.delete.content" tData={{ object: "redirection-host" }} />,
						})
					}
					onDisableToggle={handleDisableToggle}
					onNew={() => showRedirectionHostModal("new")}
				/>
			</CardContent>
		</Card>
	);
}


