import {
	IconCheck,
	IconEdit,
	IconEye,
	IconHelp,
	IconPlayerPlay,
	IconPlayerStop,
	IconPlus,
	IconRefresh,
	IconTrash,
} from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";
import { Lock, Network, RefreshCcw, Settings, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { showWireguardTunnelsHelpModal } from "./WireguardTunnels.lazy";
import type { WireguardPeer } from "@/api/backend";
import type { WireguardSettings } from "@/api/backend/wireguardSettings";
import { getWireguardSettings, updateWireguardSettings } from "@/api/backend/wireguardSettings";
import { HasPermission } from "@/components/HasPermission";
import { WireguardConfigModal } from "@/components/Nginx/WireguardConfigModal";
import { WireguardPeerModal } from "@/components/Nginx/WireguardPeerModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useHealth } from "@/hooks/useHealth";
import { useWireguardPeer, useWireguardPeers } from "@/hooks/useWireguardPeer";
import { intl, T } from "@/locale";
import { MANAGE, WIREGUARD_PEERS } from "@/modules/Permissions";

dayjs.extend(relativeTime);

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

export function WireguardTunnels() {
	const health = useHealth();
	const { data, isLoading, refetch } = useWireguardPeers();
	const { remove, enable, disable } = useWireguardPeer();
	const [isPeerModalOpen, setIsPeerModalOpen] = useState(false);
	const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
	const [selectedPeer, setSelectedPeer] = useState<WireguardPeer | null>(null);
	const [configPeerId, setConfigPeerId] = useState<number>(0);
	const [configPeerName, setConfigPeerName] = useState<string>("");
	const [isSettingsEditing, setIsSettingsEditing] = useState(false);
	const [settingsForm, setSettingsForm] = useState<WireguardSettings>({
		endpoint: "",
		listenPort: 51820,
		subnet: "10.8.0.0/24",
		serverAddress: "10.8.0.1/24",
	});

	const queryClient = useQueryClient();
	const { data: wgSettings } = useQuery({
		queryKey: ["wireguard-settings"],
		queryFn: getWireguardSettings,
		retry: false,
	});

	const saveSettings = useMutation({
		mutationFn: updateWireguardSettings,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["wireguard-settings"] });
			queryClient.invalidateQueries({ queryKey: ["wireguard-peers"] });
			setIsSettingsEditing(false);
		},
	});

	useEffect(() => {
		if (wgSettings) {
			setSettingsForm(wgSettings);
		}
	}, [wgSettings]);

	const peers = data?.peers || [];
	const server = data?.server;

	const handleEdit = (peer: WireguardPeer) => {
		setSelectedPeer(peer);
		setIsPeerModalOpen(true);
	};

	const handleDelete = (peer: WireguardPeer) => {
		if (confirm(`Are you sure you want to delete peer "${peer.name}"?`)) {
			remove.mutate(peer.id);
		}
	};

	const handleAdd = () => {
		setSelectedPeer(null);
		setIsPeerModalOpen(true);
	};

	const handleShowConfig = (peer: WireguardPeer) => {
		setConfigPeerId(peer.id);
		setConfigPeerName(peer.name);
		setIsConfigModalOpen(true);
	};

	const handleToggle = (peer: WireguardPeer) => {
		if (peer.status === 0) {
			enable.mutate(peer.id);
		} else {
			disable.mutate(peer.id);
		}
	};

	const handlePeerCreated = (newPeer: WireguardPeer) => {
		setConfigPeerId(newPeer.id);
		setConfigPeerName(newPeer.name);
		setIsConfigModalOpen(true);
	};

	const getStatusBadge = (peer: WireguardPeer) => {
		const meta = peer.meta as Record<string, unknown>;

		let isRecentHandshake = false;
		if (peer.lastHandshake) {
			isRecentHandshake = dayjs().diff(dayjs(peer.lastHandshake), "minute") < 5;
		}

		switch (peer.status) {
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
				return isRecentHandshake ? (
					<Badge className="bg-green-500 text-white hover:bg-green-600">
						<T id="online" />
					</Badge>
				) : (
					<Badge className="bg-purple-500/70 text-white hover:bg-purple-500">Waiting</Badge>
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
						Access Denied
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="p-8 text-center text-muted-foreground">
						<p className="text-lg font-semibold">This feature is disabled in Demo Mode.</p>
						<p className="mt-2">WireGuard Tunnels are restricted for security reasons.</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	return (
		<>
			{/* Server Status Card */}
			{server && (
				<Card className="mt-4 border-t-4 border-purple-500/30">
					<CardHeader className="pb-3">
						<CardTitle className="text-lg font-semibold flex items-center gap-2">
							<Network className="h-5 w-5 text-purple-500" />
							<T id="wireguard.server.status" />
							{server.available ? (
								<Badge className="bg-green-500/20 text-green-600 ml-2">
									<IconCheck className="h-3 w-3 mr-1" /> Available
								</Badge>
							) : (
								<Badge className="bg-red-500/20 text-red-600 ml-2">Unavailable</Badge>
							)}
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
							<div>
								<p className="text-muted-foreground text-xs">
									<T id="wireguard.server.endpoint" />
								</p>
								<p className="font-mono text-sm mt-1">{server.endpoint || "—"}</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs">
									<T id="wireguard.server.subnet" />
								</p>
								<p className="font-mono text-sm mt-1">{server.subnet}</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs">
									<T id="wireguard.server.publicKey" />
								</p>
								<p className="font-mono text-xs mt-1 truncate" title={server.publicKey || ""}>
									{server.publicKey ? `${server.publicKey.substring(0, 20)}...` : "—"}
								</p>
							</div>
							<div>
								<p className="text-muted-foreground text-xs">Interface</p>
								<p className="font-mono text-sm mt-1">
									{server.interfaceUp ? (
										<span className="text-green-500">● wg0 up</span>
									) : (
										<span className="text-red-500">○ wg0 down</span>
									)}
								</p>
							</div>
						</div>
					</CardContent>
				</Card>
			)}

			{/* Settings Card */}
			<Card className="mt-4 border-t-4 border-purple-500/20">
				<CardHeader className="pb-3">
					<CardTitle className="text-lg font-semibold flex items-center justify-between">
						<span className="flex items-center gap-2">
							<Settings className="h-5 w-5 text-purple-500" />
							<T id="wireguard.settings.title" />
						</span>
						<HasPermission section={WIREGUARD_PEERS} permission={MANAGE} hideError>
							{!isSettingsEditing ? (
								<Button variant="outline" size="sm" onClick={() => setIsSettingsEditing(true)}>
									<IconEdit className="h-4 w-4 mr-1" />
									<T id="edit" />
								</Button>
							) : (
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => {
											setIsSettingsEditing(false);
											if (wgSettings) setSettingsForm(wgSettings);
										}}
									>
										<T id="cancel" />
									</Button>
									<Button
										size="sm"
										className="bg-purple-600/90 hover:bg-purple-600 text-white"
										onClick={() => saveSettings.mutate(settingsForm)}
										disabled={saveSettings.isPending}
									>
										<T id="save" />
									</Button>
								</div>
							)}
						</HasPermission>
					</CardTitle>
				</CardHeader>
				<CardContent>
					<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
						<div>
							<label htmlFor="wg-endpoint-input" className="text-xs text-muted-foreground block mb-1">
								<T id="wireguard.settings.endpoint" />
							</label>
							{isSettingsEditing ? (
								<input
									id="wg-endpoint-input"
									type="text"
									className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm font-mono"
									placeholder="vpn.example.com"
									value={settingsForm.endpoint}
									onChange={(e) => setSettingsForm({ ...settingsForm, endpoint: e.target.value })}
								/>
							) : (
								<p className="font-mono text-sm">
									{settingsForm.endpoint || (
										<span className="text-muted-foreground italic">
											<T id="wireguard.settings.endpoint.placeholder" />
										</span>
									)}
								</p>
							)}
							<p className="text-xs text-muted-foreground mt-1">
								<T id="wireguard.settings.endpoint.hint" />
							</p>
						</div>
						<div>
							<label htmlFor="wg-port-input" className="text-xs text-muted-foreground block mb-1">
								<T id="wireguard.settings.port" />
							</label>
							{isSettingsEditing ? (
								<input
									id="wg-port-input"
									type="number"
									min={1}
									max={65535}
									className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm font-mono"
									value={settingsForm.listenPort}
									onChange={(e) =>
										setSettingsForm({
											...settingsForm,
											listenPort: Number.parseInt(e.target.value, 10) || 51820,
										})
									}
								/>
							) : (
								<p className="font-mono text-sm">{String(settingsForm.listenPort || 51820)}</p>
							)}
						</div>
						<div>
							<label htmlFor="wg-subnet-input" className="text-xs text-muted-foreground block mb-1">
								<T id="wireguard.settings.subnet" />
							</label>
							{isSettingsEditing ? (
								<input
									id="wg-subnet-input"
									type="text"
									className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm font-mono"
									placeholder="10.8.0.0/24"
									value={settingsForm.subnet}
									onChange={(e) => setSettingsForm({ ...settingsForm, subnet: e.target.value })}
								/>
							) : (
								<p className="font-mono text-sm">{settingsForm.subnet}</p>
							)}
						</div>
						<div>
							<label
								htmlFor="wg-server-address-input"
								className="text-xs text-muted-foreground block mb-1"
							>
								Server Address
							</label>
							{isSettingsEditing ? (
								<input
									id="wg-server-address-input"
									type="text"
									className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm font-mono"
									placeholder="10.8.0.1/24"
									value={settingsForm.serverAddress}
									onChange={(e) =>
										setSettingsForm({ ...settingsForm, serverAddress: e.target.value })
									}
								/>
							) : (
								<p className="font-mono text-sm">{settingsForm.serverAddress}</p>
							)}
						</div>
					</div>
				</CardContent>
			</Card>

			{/* Peers Table Card */}
			<Card className="mt-4 border-t-4 border-purple-500/50">
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="text-2xl font-bold flex items-center gap-2">
						<Shield className="h-6 w-6" />
						<T id="wireguard.title" />
					</CardTitle>
					<div className="flex items-center space-x-2">
						<Button
							variant="outline"
							size="icon"
							aria-label={intl.formatMessage({ id: "wireguard.refresh" })}
							onClick={() => refetch()}
						>
							<IconRefresh className="h-4 w-4" />
						</Button>
						<Button
							variant="outline"
							size="icon"
							aria-label={intl.formatMessage({ id: "action.help" })}
							onClick={showWireguardTunnelsHelpModal}
						>
							<IconHelp className="h-4 w-4" />
						</Button>
						<HasPermission section={WIREGUARD_PEERS} permission={MANAGE} hideError>
							<Button
								size="sm"
								onClick={handleAdd}
								className="bg-purple-600/90 hover:bg-purple-600 text-white shadow-sm"
							>
								<IconPlus className="mr-2 h-4 w-4" />
								<T id="wireguard.add" />
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
										<T id="wireguard.peer.address" />
									</TableHead>
									<TableHead>
										<T id="column.status" />
									</TableHead>
									<TableHead>
										<T id="wireguard.peer.lastHandshake" />
									</TableHead>
									<TableHead>
										<T id="wireguard.peer.transfer" />
									</TableHead>
									<TableHead className="text-right">
										<T id="options" />
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{isLoading ? (
									<TableRow>
										<TableCell colSpan={6} className="text-center py-8">
											<T id="loading" />
										</TableCell>
									</TableRow>
								) : peers.length === 0 ? (
									<TableRow>
										<TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
											<T id="object.empty" tData={{ objects: "Peers" }} />
										</TableCell>
									</TableRow>
								) : (
									peers.map((peer) => (
										<TableRow key={peer.id}>
											<TableCell>
												<div>
													<span className="font-medium">{peer.name}</span>
													{peer.description && (
														<p className="text-xs text-muted-foreground mt-0.5">
															{peer.description}
														</p>
													)}
												</div>
											</TableCell>
											<TableCell className="font-mono text-sm">{peer.clientAddress}</TableCell>
											<TableCell>{getStatusBadge(peer)}</TableCell>
											<TableCell className="text-sm">
												{peer.lastHandshake ? dayjs(peer.lastHandshake).fromNow() : "—"}
											</TableCell>
											<TableCell className="text-xs font-mono">
												<div className="flex flex-col space-y-0.5">
													<div className="flex items-center gap-1.5">
														<span className="text-green-500">
															↓{formatBytes(peer.transferRx || 0)}
														</span>
														<span className="text-muted-foreground opacity-30">|</span>
														<span className="text-blue-500">
															↑{formatBytes(peer.transferTx || 0)}
														</span>
													</div>
													{peer.persistentKeepalive > 0 && (
														<div className="text-[10px] text-muted-foreground flex items-center gap-1 opacity-70">
															<RefreshCcw className="h-2.5 w-2.5" />
															<span>Keepalive: {peer.persistentKeepalive}s</span>
														</div>
													)}
												</div>
											</TableCell>
											<TableCell className="text-right space-x-1">
												<HasPermission section={WIREGUARD_PEERS} permission={MANAGE} hideError>
													<TooltipProvider>
														<Tooltip>
															<TooltipTrigger asChild>
																<Button
																	variant="ghost"
																	size="icon"
																	aria-label={intl.formatMessage({
																		id: "wireguard.config.view",
																	})}
																	onClick={() => handleShowConfig(peer)}
																>
																	<IconEye className="h-4 w-4" />
																</Button>
															</TooltipTrigger>
															<TooltipContent>
																<T id="wireguard.config.title" />
															</TooltipContent>
														</Tooltip>
													</TooltipProvider>
													<Button
														variant="ghost"
														size="icon"
														aria-label={intl.formatMessage({
															id: peer.status === 0 ? "action.enable" : "action.disable",
														})}
														onClick={() => handleToggle(peer)}
													>
														{peer.status === 0 ? (
															<IconPlayerPlay className="h-4 w-4 text-green-500" />
														) : (
															<IconPlayerStop className="h-4 w-4 text-yellow-500" />
														)}
													</Button>
													<Button
														variant="ghost"
														size="icon"
														aria-label={intl.formatMessage({ id: "wireguard.edit" })}
														onClick={() => handleEdit(peer)}
													>
														<IconEdit className="h-4 w-4" />
													</Button>
													<Button
														variant="ghost"
														size="icon"
														className="text-destructive"
														aria-label={intl.formatMessage({ id: "action.delete" })}
														onClick={() => handleDelete(peer)}
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

				<WireguardPeerModal
					open={isPeerModalOpen}
					onOpenChange={setIsPeerModalOpen}
					peer={selectedPeer}
					onCreated={handlePeerCreated}
				/>
				<WireguardConfigModal
					open={isConfigModalOpen}
					onOpenChange={setIsConfigModalOpen}
					peerId={configPeerId}
					peerName={configPeerName}
				/>
			</Card>
		</>
	);
}

export default WireguardTunnels;
