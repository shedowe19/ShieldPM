import { IconEdit, IconHelp, IconPlus, IconRefresh, IconTrash } from "@tabler/icons-react";
import dayjs from "dayjs";
import { Cloud, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { showCloudflaredHelpModal } from "./CloudflaredTunnels.lazy";
import type { CloudflaredTunnel } from "@/api/backend";
import { HasPermission } from "@/components/HasPermission";
import { CloudflaredTunnelModal } from "@/components/Nginx/CloudflaredTunnelModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCloudflaredTunnel, useCloudflaredTunnels } from "@/hooks/useCloudflaredTunnel";
import { useHealth } from "@/hooks/useHealth";
import { intl, T } from "@/locale";
import { CLOUDFLARED_TUNNELS, MANAGE } from "@/modules/Permissions";

export function CloudflaredTunnels() {
	const health = useHealth();
	const { data: rawTunnels, isLoading, refetch } = useCloudflaredTunnels();
	const { remove } = useCloudflaredTunnel();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [selectedTunnel, setSelectedTunnel] = useState<CloudflaredTunnel | null>(null);

	const tunnels = useMemo(() => {
		if (!rawTunnels) return [];
		return rawTunnels.map((t) => {
			let meta = t.meta;
			if (typeof meta === "string") {
				try {
					meta = JSON.parse(meta);
				} catch (e) {
					console.error("Failed to parse tunnel meta:", e);
					meta = {};
				}
			}
			return { ...t, meta };
		});
	}, [rawTunnels]);

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
		const meta = tunnel.meta as Record<string, unknown>;

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
									{(meta?.last_error as string) || "No error details available."}
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
						<T id="cloudflared.demo.access-denied" />
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="p-8 text-center text-muted-foreground">
						<p className="text-lg font-semibold">
							<T id="cloudflared.demo.disabled" />
						</p>
						<p className="mt-2">
							<T id="cloudflared.demo.restricted" />
						</p>
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
					<Button
						variant="outline"
						size="icon"
						aria-label={intl.formatMessage({ id: "cloudflared.refresh" })}
						onClick={() => refetch()}
					>
						<IconRefresh className="h-4 w-4" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label={intl.formatMessage({ id: "action.help" })}
						onClick={showCloudflaredHelpModal}
					>
						<IconHelp className="h-4 w-4" />
					</Button>
					<HasPermission section={CLOUDFLARED_TUNNELS} permission={MANAGE} hideError>
						<Button
							size="sm"
							onClick={handleAdd}
							className="bg-orange-600/90 hover:bg-orange-600 text-white shadow-sm"
						>
							<IconPlus className="mr-2 h-4 w-4" />
							<T id="cloudflared.add" />
						</Button>
					</HasPermission>
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
											<HasPermission section={CLOUDFLARED_TUNNELS} permission={MANAGE} hideError>
												<Button
													variant="ghost"
													size="icon"
													aria-label={intl.formatMessage({ id: "cloudflared.edit" })}
													onClick={() => handleEdit(tunnel)}
												>
													<IconEdit className="h-4 w-4" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="text-destructive"
													aria-label={intl.formatMessage({ id: "action.delete" })}
													onClick={() => handleDelete(tunnel)}
												>
													<IconTrash className="h-4 w-4" />
												</Button>
											</HasPermission>
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
