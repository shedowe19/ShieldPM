import { IconEdit, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";
import { Cloud, Lock } from "lucide-react";
import { useState } from "react";
import type { CloudflaredTunnel } from "@/api/backend";
import { CloudflaredTunnelModal } from "@/components/Nginx/CloudflaredTunnelModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCloudflaredTunnel, useCloudflaredTunnels } from "@/hooks/useCloudflaredTunnel";
import { useHealth } from "@/hooks/useHealth";
import { T } from "@/locale";

export function CloudflaredTunnels() {
	const health = useHealth();
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

	const getStatusBadge = (tunnel: CloudflaredTunnel) => {
		// Ensure meta is an object (handle SQLite/serialization edge cases)
		let meta = tunnel.meta;
		if (typeof meta === "string") {
			try {
				meta = JSON.parse(meta);
			} catch (e) {
				console.error("Failed to parse tunnel meta:", e);
				meta = {};
			}
		}

		switch (tunnel.status) {
			case 0:
				return (
					<Badge className="bg-secondary text-secondary-foreground hover:bg-secondary/80">
						<T id="disabled" />
					</Badge>
				);
			case 1:
				return (
					<Badge className="bg-yellow-500 text-white hover:bg-yellow-600">
						<T id="loading" />
					</Badge>
				);
			case 2:
				return (
					<Badge className="bg-green-500 text-white hover:bg-green-600">
						<T id="online" />
					</Badge>
				);
			case 3:
				return (
					<TooltipProvider>
						<Tooltip>
							<TooltipTrigger asChild>
								<span className="cursor-help inline-flex">
									<Badge className="bg-red-500 text-white hover:bg-red-600 pointer-events-none">
										<T id="error.unknown" />
									</Badge>
								</span>
							</TooltipTrigger>
							<TooltipContent className="max-w-md">
								<p className="font-mono text-xs whitespace-pre-wrap">
									{meta?.last_error || "No error details available."}
								</p>
							</TooltipContent>
						</Tooltip>
					</TooltipProvider>
				);
			default:
				return (
					<Badge className="text-foreground">
						<T id="offline" />
					</Badge>
				);
		}
	};

	if (health.data?.demo) {
		return (
			<Card className="mt-4 border-t-4 border-red-500/50">
				<CardHeader>
					<CardTitle className="text-2xl font-bold flex items-center gap-2 text-red-500">
						<Lock className="h-6 w-6" />
						Access Denied
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="p-8 text-center text-muted-foreground">
						<p className="text-lg font-semibold">This feature is disabled in Demo Mode.</p>
						<p className="mt-2">Cloudflare Tunnels are restricted for security reasons.</p>
					</div>
				</CardContent>
			</Card>
		);
	}

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
										<TableCell>{getStatusBadge(tunnel)}</TableCell>
										<TableCell>{dayjs(tunnel.createdOn).format("YYYY-MM-DD HH:mm:ss")}</TableCell>
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
