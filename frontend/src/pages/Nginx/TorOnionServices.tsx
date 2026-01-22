import { useState } from "react";
import {
	IconPlus,
	IconRefresh,
	IconTrash,
	IconEdit,
	IconPlayerPlay,
	IconPlayerStop,
	IconCopy,
} from "@tabler/icons-react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { TorOnionModal } from "@/components/Nginx/TorOnionModal";
import { useTorOnions, useTorOnion } from "@/hooks/useTorOnion";
import type { TorOnion } from "@/api/backend";
import { T } from "@/locale";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Lock, AlertCircle } from "lucide-react";
import { useHealth } from "@/hooks/useHealth";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function TorOnionServices() {
	const health = useHealth();
	const { data, isLoading, refetch } = useTorOnions();
	const { remove, start, stop } = useTorOnion();
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [selectedService, setSelectedService] = useState<TorOnion | null>(null);
	const { toast } = useToast();

	const handleEdit = (service: TorOnion) => {
		setSelectedService(service);
		setIsModalOpen(true);
	};

	const handleDelete = (service: TorOnion) => {
		if (confirm(`Are you sure you want to delete Onion Service "${service.name}"?`)) {
			remove.mutate(service.id);
		}
	};

	const handleAdd = () => {
		setSelectedService(null);
		setIsModalOpen(true);
	};

	const handleCopy = (address: string) => {
		navigator.clipboard.writeText(address);
		toast({
			description: <T id="tor.copy_success" />,
		});
	};

	const getStatusBadge = (status: number) => {
		const statusMap: Record<number, { label: string; variant: string }> = {
			0: { label: "tor.status_stopped", variant: "secondary" },
			1: { label: "tor.status_starting", variant: "warning" },
			2: { label: "tor.status_running", variant: "success" },
			3: { label: "tor.status_error", variant: "destructive" },
		};

		const { label, variant } = statusMap[status] || statusMap[0];

		return (
			<Badge variant={variant as any}>
				<T id={label} />
			</Badge>
		);
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
						<p className="mt-2">Tor Onion Services are restricted for security reasons.</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	const services = data?.services ?? [];
	const torInfo = data?.tor;

	return (
		<Card className="mt-4 border-t-4 border-purple-500/50">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<div>
					<CardTitle className="text-2xl font-bold flex items-center gap-2">
						<span className="text-2xl">🧅</span>
						<T id="tor.title" />
					</CardTitle>
					<CardDescription className="mt-1">
						Expose services via Tor Hidden Services for privacy and CGNAT bypass
					</CardDescription>
				</div>
				<div className="flex items-center space-x-2">
					<Button variant="outline" size="icon" onClick={() => refetch()}>
						<IconRefresh className="h-4 w-4" />
					</Button>
					<Button
						size="sm"
						onClick={handleAdd}
						className="bg-purple-600/90 hover:bg-purple-600 text-white shadow-sm"
						disabled={!torInfo?.available}
					>
						<IconPlus className="mr-2 h-4 w-4" />
						<T id="tor.add" />
					</Button>
				</div>
			</CardHeader>

			<CardContent>
				{!torInfo?.available && (
					<Alert variant="destructive" className="mb-4">
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>
							<T id="tor.daemon_unavailable" />
						</AlertDescription>
					</Alert>
				)}

				{torInfo?.available && (
					<Alert className="mb-4">
						<AlertDescription>
							Tor v{torInfo.version} is running. Onion services will be accessible via Tor Browser.
						</AlertDescription>
					</Alert>
				)}

				<div className="border rounded-md">
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>
									<T id="name" />
								</TableHead>
								<TableHead>
									<T id="tor.onion_address" />
								</TableHead>
								<TableHead>
									<T id="tor.virtual_port" />
								</TableHead>
								<TableHead>
									<T id="tor.target_port" />
								</TableHead>
								<TableHead>
									<T id="column.status" />
								</TableHead>
								<TableHead className="text-right">
									<T id="options" />
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{isLoading ? (
								<TableRow>
									<TableCell colSpan={5} className="text-center py-8">
										<T id="loading" />
									</TableCell>
								</TableRow>
							) : services.length === 0 ? (
								<TableRow>
									<TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
										<T id="tor.no_services" />
									</TableCell>
								</TableRow>
							) : (
								services.map((service) => (
									<TableRow key={service.id}>
										<TableCell className="font-medium">{service.name}</TableCell>
										<TableCell>
											{service.onionAddress ? (
												<div className="flex items-center gap-2">
													<code className="text-xs bg-muted px-2 py-1 rounded font-mono truncate max-w-[300px]">
														{service.onionAddress}
													</code>
													<Button
														variant="ghost"
														size="icon"
														className="h-6 w-6"
														onClick={() => handleCopy(service.onionAddress!)}
													>
														<IconCopy className="h-3 w-3" />
													</Button>
												</div>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>{service.virtualPort}</TableCell>
										<TableCell>{getStatusBadge(service.status)}</TableCell>
										<TableCell className="text-right space-x-1">
											{service.status === 2 ? (
												<Button
													variant="ghost"
													size="icon"
													onClick={() => stop.mutate(service.id)}
													disabled={stop.isPending}
												>
													<IconPlayerStop className="h-4 w-4" />
												</Button>
											) : (
												<Button
													variant="ghost"
													size="icon"
													onClick={() => start.mutate(service.id)}
													disabled={start.isPending}
												>
													<IconPlayerPlay className="h-4 w-4" />
												</Button>
											)}
											<Button variant="ghost" size="icon" onClick={() => handleEdit(service)}>
												<IconEdit className="h-4 w-4" />
											</Button>
											<Button
												variant="ghost"
												size="icon"
												className="text-destructive"
												onClick={() => handleDelete(service)}
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

			<TorOnionModal open={isModalOpen} onOpenChange={setIsModalOpen} service={selectedService} />
		</Card>
	);
}

export default TorOnionServices;
