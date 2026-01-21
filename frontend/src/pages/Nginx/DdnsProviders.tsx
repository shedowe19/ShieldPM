import { ActionIcon, Badge, Group, Text } from "@mantine/core";
import { IconPlus, IconTrash, IconWorld } from "@tabler/icons-react";
import { type ColumnDef, createColumnHelper } from "@tanstack/react-table";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type DdnsProvider, deleteDdnsProvider } from "src/api/backend";
import { getDdnsProviders } from "src/api/backend/getDdnsProviders";
import { showDdnsProviderModal } from "src/modals/DdnsProviderModal";
import { showDeleteConfirmModal } from "src/modals/DeleteConfirmModal";
import { Button } from "src/components/ui/button";
import { DataTable } from "src/components/ui/data-table";
import { T } from "src/locale";
import { showObjectDelete } from "src/notifications";

const columnHelper = createColumnHelper<DdnsProvider>();

const DdnsProviders = () => {
    const queryClient = useQueryClient();
    const { data, isLoading } = useQuery({
        queryKey: ["ddns-providers"],
        queryFn: getDdnsProviders
    });

    const columns: ColumnDef<DdnsProvider, any>[] = [
        columnHelper.accessor("name", {
            header: () => <T id="column.name" />,
            cell: (info) => (
                <div className="flex flex-col">
                    <span className="font-medium">{info.getValue()}</span>
                    <span className="text-xs text-muted-foreground">{info.row.original.domains.join(", ")}</span>
                </div>
            ),
        }),
        columnHelper.accessor("provider", {
            header: () => <T id="ddns-providers.provider" />,
            cell: (info) => <Badge variant="outline">{info.getValue()}</Badge>,
        }),
        columnHelper.accessor("lastUpdatedOn", {
            header: () => <T id="ddns-providers.last_updated" />,
            cell: (info) => (
                <div className="flex flex-col text-xs">
                    <span>{info.getValue() || "-"}</span>
                    {info.row.original.lastError && (
                        <span className="text-destructive font-semibold">Error: {info.row.original.lastError}</span>
                    )}
                </div>
            )
        }),
        columnHelper.accessor("lastIpv4", {
            header: () => <T id="ddns-providers.last_ip" />,
            cell: (info) => (
                <div className="flex flex-col text-xs">
                    {info.row.original.lastIpv4 && <span>v4: {info.row.original.lastIpv4}</span>}
                    {info.row.original.lastIpv6 && <span>v6: {info.row.original.lastIpv6}</span>}
                    {!info.row.original.lastIpv4 && !info.row.original.lastIpv6 && <span>-</span>}
                </div>
            )
        }),
        columnHelper.display({
            id: "actions",
            header: () => <T id="options" />,
            cell: (info) => (
                <Group gap="xs">
                    <ActionIcon
                        variant="subtle"
                        color="blue"
                        onClick={() => showDdnsProviderModal(info.row.original.id)}
                    >
                        <IconWorld size={16} />
                    </ActionIcon>
                    <ActionIcon
                        variant="subtle"
                        color="red"
                        onClick={() => {
                            showDeleteConfirmModal({
                                title: <T id="object.delete" tData={{ object: "ddns-provider" }} />,
                                children: <T id="object.delete.content" tData={{ object: "ddns-provider" }} />,
                                onConfirm: async () => {
                                    await deleteDdnsProvider(info.row.original.id);
                                    showObjectDelete("ddns-provider");
                                    queryClient.invalidateQueries({ queryKey: ["ddns-providers"] });
                                }
                            });
                        }}
                    >
                        <IconTrash size={16} />
                    </ActionIcon>
                </Group>
            )
        })
    ];

    return (
        <div className="flex flex-col gap-4 p-4">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight"><T id="ddns-providers" /></h1>
                    <p className="text-muted-foreground">
                        Manage Dynamic DNS providers to keep your domains updated.
                    </p>
                </div>
                <Button onClick={() => showDdnsProviderModal()}>
                    <IconPlus className="mr-2 h-4 w-4" />
                    <T id="action.add" />
                </Button>
            </div>

            <DataTable
                columns={columns}
                data={data || []}
                loading={isLoading}
            />
        </div>
    );
};

export default DdnsProviders;
