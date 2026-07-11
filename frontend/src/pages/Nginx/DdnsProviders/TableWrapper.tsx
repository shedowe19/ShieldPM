import { IconHelp, IconPlus, IconSearch, IconWorld } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { deleteDdnsProvider, getDdnsProviders } from "src/api/backend";
import { LoadingPage } from "src/components";
import { HasPermission } from "src/components/HasPermission";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { intl, T } from "src/locale";
import { DDNS_PROVIDERS, MANAGE } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import { showDdnsProviderModal, showDeleteConfirmModal, showHelpModal } from "./lazy";
import Table from "./Table";

export default function TableWrapper() {
	const [search, setSearch] = useState("");
	const { isFetching, isLoading, isError, error, data } = useQuery({
		queryKey: ["ddns-providers"],
		queryFn: getDdnsProviders,
	});

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
		await deleteDdnsProvider(id);
		showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.DDNS_PROVIDER, "deleted");
	};

	let filtered = null;
	if (search && data) {
		filtered = data?.filter(
			(item) =>
				item.name.toLowerCase().includes(search) ||
				item.provider.toLowerCase().includes(search) ||
				item.domains.some((d) => d.toLowerCase().includes(search)),
		);
	} else if (search !== "") {
		setSearch("");
	}

	return (
		<Card className="mt-4 border-t-4 border-cyan-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<IconWorld className="h-6 w-6" />
					<T id="ddns-providers" />
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
					<Button
						variant="outline"
						size="icon"
						aria-label={intl.formatMessage({ id: "action.help" })}
						onClick={() => showHelpModal("DdnsProviders", "cyan")}
					>
						<IconHelp className="h-4 w-4" />
					</Button>
					<HasPermission section={DDNS_PROVIDERS} permission={MANAGE} hideError>
						<Button
							size="sm"
							className="bg-cyan-600/90 hover:bg-cyan-600 text-white shadow-sm"
							disabled={!data}
							onClick={() => showDdnsProviderModal()}
						>
							<IconPlus className="mr-2 h-4 w-4" />
							<T
								id="object.add"
								tData={{ object: intl.formatMessage({ id: AUDIT_LOG_OBJECT_TYPE.DDNS_PROVIDER }) }}
							/>
						</Button>
					</HasPermission>
				</div>
			</CardHeader>
			<CardContent>
				<Table
					data={filtered ?? data ?? []}
					isFiltered={!!search}
					isFetching={isFetching}
					onEdit={(id: number) => showDdnsProviderModal(id)}
					onDelete={(id: number) =>
						showDeleteConfirmModal({
							title: (
								<T id="object.delete" tData={{ object: intl.formatMessage({ id: "ddns-provider" }) }} />
							),
							onConfirm: () => handleDelete(id),
							invalidations: [["ddns-providers"]],
							children: (
								<T
									id="object.delete.content"
									tData={{ object: intl.formatMessage({ id: "ddns-provider" }) }}
								/>
							),
						})
					}
					onNew={() => showDdnsProviderModal()}
				/>
			</CardContent>
		</Card>
	);
}
