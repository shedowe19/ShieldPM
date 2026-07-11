import {
	IconCopy,
	IconEdit,
	IconHelp,
	IconPlayerPlay,
	IconPlayerStop,
	IconPlus,
	IconRefresh,
	IconTrash,
} from "@tabler/icons-react";
import { AlertCircle, Lock } from "lucide-react";
import { useState } from "react";
import { BADGE_VARIANT, type BadgeVariant, TOR_ONION_STATUS, type TorOnionStatus } from "src/types/enums";
import { showTorOnionServicesHelpModal } from "./TorOnionServices.lazy";
import type { TorOnion } from "@/api/backend";
import { HasPermission } from "@/components/HasPermission";
import { TorOnionModal } from "@/components/Nginx/TorOnionModal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useHealth } from "@/hooks/useHealth";
import { useTorOnion, useTorOnions } from "@/hooks/useTorOnion";
import { intl, T } from "@/locale";
import { MANAGE, TOR_ONIONS } from "@/modules/Permissions";

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

	const getStatusBadge = (status: TorOnionStatus) => {
		let label: string;
		let variant: BadgeVariant = BADGE_VARIANT.SECONDARY;

		switch (status) {
			case TOR_ONION_STATUS.STOPPED:
				label = "tor.status_stopped";
				variant = BADGE_VARIANT.SECONDARY;
				break;
			case TOR_ONION_STATUS.STARTING:
				label = "tor.status_starting";
				variant = BADGE_VARIANT.WARNING;
				break;
			case TOR_ONION_STATUS.RUNNING:
				label = "tor.status_running";
				variant = BADGE_VARIANT.SUCCESS;
				break;
			case TOR_ONION_STATUS.ERROR:
				label = "tor.status_error";
				variant = BADGE_VARIANT.DESTRUCTIVE;
				break;
			default:
				label = "tor.status_stopped"; // Default label
				variant = BADGE_VARIANT.SECONDARY; // Default variant
				break;
		}

		return (
			<Badge variant={variant}>
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
						<T id="tor.demo_mode_title" />
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="p-8 text-center text-muted-foreground">
						<p className="text-lg font-semibold">
							<T id="tor.demo_mode_desc" />
						</p>
						<p className="mt-2">
							<T id="tor.demo_mode_subdesc" />
						</p>
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
						<T id="tor.description" />
					</CardDescription>
				</div>
				<div className="flex items-center space-x-2">
					<Button
						variant="outline"
						size="icon"
						aria-label={intl.formatMessage({ id: "tor.refresh" })}
						onClick={() => refetch()}
					>
						<IconRefresh className="h-4 w-4" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						aria-label={intl.formatMessage({ id: "action.help" })}
						onClick={showTorOnionServicesHelpModal}
					>
						<IconHelp className="h-4 w-4" />
					</Button>
					<HasPermission section={TOR_ONIONS} permission={MANAGE} hideError>
						<Button
							size="sm"
							onClick={handleAdd}
							className="bg-purple-600/90 hover:bg-purple-600 text-white shadow-sm"
							disabled={!torInfo?.available}
						>
							<IconPlus className="mr-2 h-4 w-4" />
							<T id="tor.add" />
						</Button>
					</HasPermission>
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
							<T id="tor.running_status" data={{ version: torInfo.version || "" }} />
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
														aria-label={intl.formatMessage({ id: "tor.copy_address" })}
														onClick={() => handleCopy(service.onionAddress || "")}
													>
														<IconCopy className="h-3 w-3" />
													</Button>
												</div>
											) : (
												<span className="text-muted-foreground">—</span>
											)}
										</TableCell>
										<TableCell>{service.virtualPort}</TableCell>
										<TableCell>{service.targetPort}</TableCell>
										<TableCell>{getStatusBadge(service.status)}</TableCell>
										<TableCell className="text-right space-x-1">
											<HasPermission section={TOR_ONIONS} permission={MANAGE} hideError>
												{service.status === TOR_ONION_STATUS.RUNNING ? (
													<Button
														variant="ghost"
														size="icon"
														aria-label={intl.formatMessage({ id: "tor.stop" })}
														onClick={() => stop.mutate(service.id)}
														disabled={stop.isPending}
													>
														<IconPlayerStop className="h-4 w-4" />
													</Button>
												) : (
													<Button
														variant="ghost"
														size="icon"
														aria-label={intl.formatMessage({ id: "tor.start" })}
														onClick={() => start.mutate(service.id)}
														disabled={start.isPending}
													>
														<IconPlayerPlay className="h-4 w-4" />
													</Button>
												)}
												<Button
													variant="ghost"
													size="icon"
													aria-label={intl.formatMessage({ id: "tor.edit" })}
													onClick={() => handleEdit(service)}
												>
													<IconEdit className="h-4 w-4" />
												</Button>
												<Button
													variant="ghost"
													size="icon"
													className="text-destructive"
													aria-label={intl.formatMessage({ id: "action.delete" })}
													onClick={() => handleDelete(service)}
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

			<TorOnionModal open={isModalOpen} onOpenChange={setIsModalOpen} service={selectedService} />
		</Card>
	);
}

export default TorOnionServices;
