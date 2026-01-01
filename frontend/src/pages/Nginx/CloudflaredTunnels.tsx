import { useState } from "react";
import { IconPlus, IconRefresh, IconTrash, IconEdit } from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { CloudflaredTunnelModal } from "@/components/Nginx/CloudflaredTunnelModal";
import { useCloudflaredTunnels, useCloudflaredTunnel } from "@/hooks/useCloudflaredTunnel";
import type { CloudflaredTunnel } from "@/api/backend";
import { T } from "@/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Cloud } from "lucide-react";

export function CloudflaredTunnels() {
	const { data: tunnels, isLoading, refetch } = useCloudflaredTunnels();
	const { remove } = useCloudflaredTunnel();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [selectedTunnel, setSelectedTunnel] = useState<CloudflaredTunnel | null>(null);

	const handleEdit = (tunnel: CloudflaredTunnel) => {
		setSelectedTunnel(tunnel);
		setIsModalOpen(true);
	};

	const handleDelete = (tunnel: CloudflaredTunnel) => {
		if (confirm(`Are you sure you want to delete tunnel "${tunnel.name}"?`)) {
			remove.mutate(tunnel.id);
		}
	};

	const handleAdd = () => {
		setSelectedTunnel(null);
		setIsModalOpen(true);
	};

	const getStatusBadge = (status: number) => {
		switch (status) {
			case 0:
				return (
					<Badge variant="secondary">
						<T id="disabled" />
					</Badge>
				);
			case 1:
				return (
					<Badge variant="warning">
						<T id="loading" />
					</Badge>
				);
			case 2:
				return (
					<Badge variant="success">
						<T id="online" />
					</Badge>
				);
			case 3:
				return (
					<Badge variant="destructive">
						<T id="error.unknown" />
					</Badge>
				);
			default:
				return (
					<Badge variant="outline">
						<T id="offline" />
					</Badge>
				);
		}
	};

	return (
		<Card className="mt-4 border-t-4 border-orange-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-2xl font-bold flex items-center gap-2">
					<Cloud className="h-6 w-6" />
					<T id="cloudflared.title" />
				</CardTitle>
				<div className="flex items-center space-x-2">
					<Button variant="outline" size="icon" onClick={() => refetch()}>
						<IconRefresh className="h-4 w-4" />
					</Button>
					<Button
						size="sm"
						onClick={handleAdd}
						className="bg-orange-600/90 hover:bg-orange-600 text-white shadow-sm"
					>
						<IconPlus className="mr-2 h-4 w-4" />
						<T id="cloudflared.add" />
					</Button>
				</div>
			</CardHeader>

			<CardContent>
				<div className="border rounded-md">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>
									<T id="name" />
								</TableHead>
								<TableHead>
									<T id="column.status" />
								</TableHead>
								<TableHead>
									<T id="column.created" />
								</TableHead>
								<TableHead className="text-right">
									<T id="options" />
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoading ? (
								<TableRow>
									<TableCell colSpan={4} className="text-center py-8">
										<T id="loading" />
									</TableCell>
								</TableRow>
							) : tunnels?.length === 0 ? (
								<TableRow>
									<TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
										<T id="object.empty" tData={{ objects: "Tunnels" }} />
									</TableCell>
								</TableRow>
							) : (
								tunnels?.map((tunnel) => (
									<TableRow key={tunnel.id}>
										<TableCell className="font-medium">{tunnel.name}</TableCell>
										<TableCell>{getStatusBadge(tunnel.status)}</TableCell>
										<TableCell>{tunnel.createdOn}</TableCell>
										<TableCell className="text-right space-x-2">
											<Button variant="ghost" size="icon" onClick={() => handleEdit(tunnel)}>
												<IconEdit className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="text-destructive"
												onClick={() => handleDelete(tunnel)}
											>
												<IconTrash className="h-4 w-4" />
											</Button>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</div>
			</CardContent>

			<CloudflaredTunnelModal open={isModalOpen} onOpenChange={setIsModalOpen} tunnel={selectedTunnel} />
		</Card>
	);
}

export default CloudflaredTunnels;
