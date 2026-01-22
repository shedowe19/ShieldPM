import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit, Plus, Terminal, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { deleteTerminalHost, getTerminalHosts, type TerminalHost } from "../../api/backend";
import WebTerminal from "../../components/Terminal/WebTerminal";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { useToast } from "../../hooks/use-toast";
import TerminalHostModal from "../../modals/TerminalHostModal";

const TerminalHosts = () => {
	const { t } = useTranslation();
	const { toast } = useToast();
	const queryClient = useQueryClient();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [editingHost, setEditingHost] = useState<TerminalHost | null>(null);
	const [connectedHost, setConnectedHost] = useState<TerminalHost | null>(null);

	const { data: hosts, isLoading } = useQuery({
		queryKey: ["terminal-hosts"],
		queryFn: () => getTerminalHosts(),
	});

	const deleteMutation = useMutation({
		mutationFn: deleteTerminalHost,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["terminal-hosts"] });
			toast({
				title: t("Success"),
				description: t("Host deleted"),
			});
		},
		onError: (err: any) => {
			toast({
				variant: "destructive",
				title: t("Error"),
				description: err.message,
			});
		},
	});

	const handleEdit = (host: TerminalHost) => {
		setEditingHost(host);
		setIsModalOpen(true);
	};

	const handleDelete = (id: number) => {
		if (confirm(t("Are you sure you want to delete this host?"))) {
			deleteMutation.mutate(id);
		}
	};

	const handleConnect = (host: TerminalHost) => {
		setConnectedHost(host);
	};

	return (
		<div className="p-4 w-full">
			<div className="flex justify-between items-center mb-6">
				<h1 className="text-2xl font-bold flex items-center gap-2">
					<Terminal className="h-8 w-8 text-primary" />
					{t("Terminal Hosts")}
				</h1>
				<Button
					onClick={() => {
						setEditingHost(null);
						setIsModalOpen(true);
					}}
				>
					<Plus className="mr-2 h-4 w-4" />
					{t("Add Host")}
				</Button>
			</div>

			<div className="rounded-md border bg-card">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>{t("Name")}</TableHead>
							<TableHead>{t("Host")}</TableHead>
							<TableHead>{t("Port")}</TableHead>
							<TableHead>{t("User")}</TableHead>
							<TableHead className="text-right">{t("Actions")}</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{isLoading ? (
							<TableRow>
								<TableCell colSpan={5} className="text-center h-24">
									{t("Loading...")}
								</TableCell>
							</TableRow>
						) : hosts && hosts.length > 0 ? (
							hosts.map((host: TerminalHost) => (
								<TableRow key={host.id}>
									<TableCell className="font-medium">{host.name}</TableCell>
									<TableCell>{host.host}</TableCell>
									<TableCell>{host.port}</TableCell>
									<TableCell>{host.username}</TableCell>
									<TableCell className="text-right space-x-2">
										<Button variant="default" size="sm" onClick={() => handleConnect(host)}>
											<Terminal className="h-4 w-4 mr-1" />
											{t("Connect")}
										</Button>

										<Button variant="ghost" size="icon" onClick={() => handleEdit(host)}>
											<Edit className="h-4 w-4" />
										</Button>
										<Button
											variant="ghost"
											size="icon"
											className="text-destructive hover:text-destructive"
											onClick={() => handleDelete(host.id)}
										>
											<Trash2 className="h-4 w-4" />
										</Button>
									</TableCell>
								</TableRow>
							))
						) : (
							<TableRow>
								<TableCell colSpan={5} className="text-center h-24 text-muted-foreground">
									{t("No terminal hosts found. Add one to get started.")}
								</TableCell>
							</TableRow>
						)}
					</TableBody>
				</Table>
			</div>

			<TerminalHostModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} editingHost={editingHost} />

			{/* Terminal Window Overlay */}
			{connectedHost && (
				<div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
					<div className="w-full h-full max-w-6xl max-h-[80vh] border rounded-lg shadow-2xl overflow-hidden bg-black ring-1 ring-border">
						<WebTerminal host={connectedHost} onClose={() => setConnectedHost(null)} />
					</div>
				</div>
			)}
		</div>
	);
};

export default TerminalHosts;
