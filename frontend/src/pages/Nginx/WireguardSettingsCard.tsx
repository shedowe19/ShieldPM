import { IconEdit } from "@tabler/icons-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Settings } from "lucide-react";
import { useEffect, useState } from "react";
import type { WireguardSettings } from "@/api/backend/wireguardSettings";
import { getWireguardSettings, updateWireguardSettings } from "@/api/backend/wireguardSettings";
import { HasPermission } from "@/components/HasPermission";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { T } from "@/locale";
import { MANAGE, WIREGUARD_PEERS } from "@/modules/Permissions";

const defaultSettings: WireguardSettings = {
	endpoint: "",
	listenPort: 51820,
	serverAddress: "10.8.0.1/24",
	subnet: "10.8.0.0/24",
};

export function WireguardSettingsCard() {
	const [isSettingsEditing, setIsSettingsEditing] = useState(false);
	const [settingsForm, setSettingsForm] = useState<WireguardSettings>(defaultSettings);
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

	return (
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
								onChange={(event) => setSettingsForm({ ...settingsForm, endpoint: event.target.value })}
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
								onChange={(event) =>
									setSettingsForm({
										...settingsForm,
										listenPort: Number.parseInt(event.target.value, 10) || 51820,
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
								onChange={(event) => setSettingsForm({ ...settingsForm, subnet: event.target.value })}
							/>
						) : (
							<p className="font-mono text-sm">{settingsForm.subnet}</p>
						)}
					</div>
					<div>
						<label htmlFor="wg-server-address-input" className="text-xs text-muted-foreground block mb-1">
							<T id="wireguard.settings.serverAddress" />
						</label>
						{isSettingsEditing ? (
							<input
								id="wg-server-address-input"
								type="text"
								className="flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm font-mono"
								placeholder="10.8.0.1/24"
								value={settingsForm.serverAddress}
								onChange={(event) =>
									setSettingsForm({ ...settingsForm, serverAddress: event.target.value })
								}
							/>
						) : (
							<p className="font-mono text-sm">{settingsForm.serverAddress}</p>
						)}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
