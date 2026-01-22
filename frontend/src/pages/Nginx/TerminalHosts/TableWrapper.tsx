import { IconHelp, IconPlus, IconSearch, IconTerminal2 } from "@tabler/icons-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import { useState } from "react";
import { deleteTerminalHost, getTerminalHosts, type TerminalHost } from "src/api/backend";
import {
    HasPermission,
    LoadingPage,
} from "src/components";
import WebTerminal from "src/components/Terminal/WebTerminal";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { Input } from "src/components/ui/input";
import { intl, T } from "src/locale";
import { showDeleteConfirmModal, showHelpModal } from "src/modals";
import TerminalHostModal from "src/modals/TerminalHostModal";
import { MANAGE, PROXY_HOSTS } from "src/modules/Permissions";
import { showObjectSuccess } from "src/notifications";
import Table from "./Table";

export default function TableWrapper() {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState("");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingHost, setEditingHost] = useState<TerminalHost | null>(null);
    const [connectedHost, setConnectedHost] = useState<TerminalHost | null>(null);

    const { isFetching, isLoading, isError, error, data } = useQuery({
        queryKey: ["terminal-hosts"],
        queryFn: () => getTerminalHosts(),
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
        await deleteTerminalHost(id);
        queryClient.invalidateQueries({ queryKey: ["terminal-hosts"] });
        showObjectSuccess("terminal-host", "deleted");
    };

    let filtered = null;
    if (search && data) {
        filtered = data?.filter(
            (item: TerminalHost) =>
                item.name.toLowerCase().includes(search) ||
                item.host.toLowerCase().includes(search) ||
                item.username.toLowerCase().includes(search) ||
                `${item.port}`.includes(search),
        );
    } else if (search !== "") {
        setSearch("");
    }

    return (
        <>
            <Card className="mt-4 border-t-4 border-slate-500/50">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-2xl font-bold flex items-center gap-2">
                        <IconTerminal2 className="h-6 w-6" />
                        <T id="terminal-hosts" />
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
                        <Button variant="outline" size="icon" onClick={() => showHelpModal("TerminalHosts", "slate")}>
                            <IconHelp className="h-4 w-4" />
                        </Button>
                        <HasPermission section={PROXY_HOSTS} permission={MANAGE} hideError>
                            {data?.length ? (
                                <Button
                                    size="sm"
                                    className="bg-slate-600/90 hover:bg-slate-600 text-white shadow-sm"
                                    onClick={() => {
                                        setEditingHost(null);
                                        setIsModalOpen(true);
                                    }}
                                >
                                    <IconPlus className="mr-2 h-4 w-4" />
                                    <T id="object.add" tData={{ object: "terminal-host" }} />
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
                        onEdit={(host) => {
                            setEditingHost(host);
                            setIsModalOpen(true);
                        }}
                        onConnect={(host) => setConnectedHost(host)}
                        onDelete={(id: number) =>
                            showDeleteConfirmModal({
                                title: <T id="object.delete" tData={{ object: "terminal-host" }} />,
                                onConfirm: () => handleDelete(id),
                                children: <T id="object.delete.content" tData={{ object: "terminal-host" }} />,
                            })
                        }
                        onNew={() => {
                            setEditingHost(null);
                            setIsModalOpen(true);
                        }}
                    />
                </CardContent>
            </Card>

            <TerminalHostModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                editingHost={editingHost}
            />

            {/* Terminal Window Overlay */}
            {connectedHost && (
                <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full h-full max-w-6xl max-h-[80vh] border rounded-lg shadow-2xl overflow-hidden bg-black ring-1 ring-border relative flex flex-col">
                        {/* Header for Close Button */}
                        <div className="h-8 bg-muted flex items-center justify-between px-3 border-b">
                            <span className="text-xs font-mono text-muted-foreground">
                                {connectedHost.username}@{connectedHost.host}:{connectedHost.port}
                            </span>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-destructive hover:text-white"
                                onClick={() => setConnectedHost(null)}
                            >
                                ✕
                            </Button>
                        </div>
                        <div className="flex-1 overflow-hidden relative">
                            <WebTerminal host={connectedHost} onClose={() => setConnectedHost(null)} />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
