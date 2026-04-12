import {
	IconArrowUpRight,
	IconBox,
	IconCheck,
	IconDownload,
	IconInfoCircle,
	IconPackage,
	IconRefresh,
	IconTrash,
} from "@tabler/icons-react";
import { AlertCircle, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { installAddon, uninstallAddon, updateAddon, updateAllAddons } from "src/api/backend/addonActions";
import type { RegistryAddon } from "src/api/backend/getAddonRegistry";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Badge } from "src/components/ui/badge";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "src/components/ui/card";
import { useAddonRegistry, useInvalidateAddons, useInstalledAddons } from "src/hooks/useAddons";

const CATEGORY_STYLES: Record<string, { label: string; className: string }> = {
	security: { label: "Security", className: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
	auth: { label: "Auth", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
	tunneling: { label: "Tunneling", className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
	networking: { label: "Networking", className: "bg-green-500/20 text-green-400 border-green-500/30" },
	privacy: { label: "Privacy", className: "bg-teal-500/20 text-teal-400 border-teal-500/30" },
};

function CategoryBadge({ category }: { category: string }) {
	const style = CATEGORY_STYLES[category] ?? { label: category, className: "bg-slate-500/20 text-slate-400 border-slate-500/30" };
	return (
		<span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${style.className}`}>
			{style.label}
		</span>
	);
}

interface AddonCardProps {
	addon: RegistryAddon;
	installedVersion: string | undefined;
	pending: string | null;
	onInstall: (addon: RegistryAddon) => void;
	onUninstall: (id: string) => void;
	onUpdate: (id: string) => void;
}

function AddonCard({ addon, installedVersion, pending, onInstall, onUninstall, onUpdate }: AddonCardProps) {
	const isInstalled = installedVersion !== undefined;
	const hasUpdate = isInstalled && installedVersion !== addon.version;
	const isLoading = pending === addon.id;
	const [dismissed, setDismissed] = useState(false);
	const showNote = isInstalled && addon.installNote && !dismissed;

	return (
		<Card className="flex flex-col border-slate-800 bg-slate-900/50">
			<CardHeader className="pb-3">
				<div className="flex items-start justify-between gap-2">
					<div className="flex flex-wrap gap-1.5">
						<CategoryBadge category={addon.category} />
						<span className="inline-flex items-center rounded-full border border-slate-700 px-2 py-0.5 text-xs text-slate-400">
							{addon.type === "apt" ? "apt" : "binary"}
						</span>
					</div>
					{isInstalled && (
						<span className="flex items-center gap-1 text-xs text-emerald-400 shrink-0">
							<IconCheck className="h-3 w-3" />
							Installed
						</span>
					)}
				</div>
				<div className="mt-2">
					<CardTitle className="text-base font-semibold leading-tight">{addon.name}</CardTitle>
					<p className="text-xs text-slate-500 mt-0.5">
						v{addon.version}
						{isInstalled && hasUpdate && (
							<span className="ml-2 text-amber-400">→ update available</span>
						)}
						{isInstalled && !hasUpdate && (
							<span className="ml-2 text-emerald-500">(up to date)</span>
						)}
					</p>
				</div>
				<CardDescription className="text-sm text-slate-400 leading-snug">{addon.description}</CardDescription>
			</CardHeader>

			<CardContent className="flex-1 pb-3">
				<a
					href={addon.url}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300 transition-colors"
				>
					{addon.author}
					<IconArrowUpRight className="h-3 w-3" />
				</a>

				{addon.requiresRestart && isInstalled && (
					<p className="mt-2 text-xs text-amber-400 flex items-center gap-1">
						<IconInfoCircle className="h-3 w-3 shrink-0" />
						Requires container restart after install
					</p>
				)}

				{showNote && (
					<Alert className="mt-3 border-slate-700 bg-slate-800/60 text-xs p-3">
						<IconInfoCircle className="h-3.5 w-3.5" />
						<AlertTitle className="text-xs font-medium mb-1">Post-install note</AlertTitle>
						<AlertDescription className="text-xs text-slate-400 whitespace-pre-wrap">
							{addon.installNote}
						</AlertDescription>
						<button
							type="button"
							onClick={() => setDismissed(true)}
							className="mt-2 text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2"
						>
							Dismiss
						</button>
					</Alert>
				)}
			</CardContent>

			<CardFooter className="pt-0 flex gap-2 flex-wrap">
				{!isInstalled ? (
					<Button
						size="sm"
						className="flex-1"
						disabled={isLoading || pending !== null}
						onClick={() => onInstall(addon)}
					>
						{isLoading ? (
							<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
						) : (
							<IconDownload className="h-3.5 w-3.5 mr-1.5" />
						)}
						Install
					</Button>
				) : (
					<>
						{hasUpdate && (
							<Button
								size="sm"
								variant="outline"
								className="flex-1 border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
								disabled={isLoading || pending !== null}
								onClick={() => onUpdate(addon.id)}
							>
								{isLoading ? (
									<Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
								) : (
									<IconRefresh className="h-3.5 w-3.5 mr-1.5" />
								)}
								Update
							</Button>
						)}
						<Button
							size="sm"
							variant="outline"
							className="border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-300"
							disabled={isLoading || pending !== null}
							onClick={() => onUninstall(addon.id)}
						>
							{isLoading ? (
								<Loader2 className="h-3.5 w-3.5 animate-spin" />
							) : (
								<IconTrash className="h-3.5 w-3.5" />
							)}
						</Button>
					</>
				)}
			</CardFooter>
		</Card>
	);
}

export default function Addons() {
	const { data: registry, isLoading: registryLoading, error: registryError, refetch: refetchRegistry } = useAddonRegistry();
	const { data: installed, refetch: refetchInstalled } = useInstalledAddons();
	const invalidateAddons = useInvalidateAddons();

	const [pending, setPending] = useState<string | null>(null);
	const [globalError, setGlobalError] = useState<string | null>(null);
	const [updatingAll, setUpdatingAll] = useState(false);

	const installedMap = useMemo(
		() => new Map((installed ?? []).map((a) => [a.id, a.version])),
		[installed],
	);

	const updatableCount = useMemo(
		() =>
			(registry?.addons ?? []).filter((a) => {
				const iv = installedMap.get(a.id);
				return iv !== undefined && iv !== a.version;
			}).length,
		[registry, installedMap],
	);

	const handleInstall = async (addon: RegistryAddon) => {
		setPending(addon.id);
		setGlobalError(null);
		try {
			await installAddon(addon.id, addon);
			await refetchInstalled();
			invalidateAddons();
		} catch (err) {
			setGlobalError((err as Error).message ?? "Install failed");
		} finally {
			setPending(null);
		}
	};

	const handleUninstall = async (id: string) => {
		setPending(id);
		setGlobalError(null);
		try {
			await uninstallAddon(id);
			await refetchInstalled();
			invalidateAddons();
		} catch (err) {
			setGlobalError((err as Error).message ?? "Uninstall failed");
		} finally {
			setPending(null);
		}
	};

	const handleUpdate = async (id: string) => {
		setPending(id);
		setGlobalError(null);
		try {
			await updateAddon(id);
			await refetchInstalled();
			invalidateAddons();
		} catch (err) {
			setGlobalError((err as Error).message ?? "Update failed");
		} finally {
			setPending(null);
		}
	};

	const handleUpdateAll = async () => {
		setUpdatingAll(true);
		setGlobalError(null);
		try {
			await updateAllAddons();
			await refetchInstalled();
			invalidateAddons();
		} catch (err) {
			setGlobalError((err as Error).message ?? "Update all failed");
		} finally {
			setUpdatingAll(false);
		}
	};

	return (
		<div className="space-y-6">
			<div className="flex items-start justify-between gap-4 flex-wrap">
				<div>
					<h3 className="text-lg font-semibold flex items-center gap-2">
						<IconPackage className="h-5 w-5" />
						Addon Store
					</h3>
					<p className="text-sm text-muted-foreground mt-1">
						Install optional features on demand. Binaries are stored in the persistent{" "}
						<code className="text-xs bg-slate-800 px-1 py-0.5 rounded">/data/addons/</code> volume.
					</p>
				</div>
				<div className="flex gap-2 shrink-0">
					<Button
						size="sm"
						variant="outline"
						onClick={() => { refetchRegistry(); refetchInstalled(); }}
						disabled={registryLoading || pending !== null || updatingAll}
					>
						<IconRefresh className="h-4 w-4 mr-1.5" />
						Refresh
					</Button>
					{updatableCount > 0 && (
						<Button
							size="sm"
							onClick={handleUpdateAll}
							disabled={updatingAll || pending !== null}
						>
							{updatingAll ? (
								<Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
							) : (
								<IconRefresh className="h-4 w-4 mr-1.5" />
							)}
							Update all ({updatableCount})
						</Button>
					)}
				</div>
			</div>

			{globalError && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertTitle>Error</AlertTitle>
					<AlertDescription>{globalError}</AlertDescription>
				</Alert>
			)}

			{registryError && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertTitle>Failed to load registry</AlertTitle>
					<AlertDescription>
						Could not fetch the addon registry from GitHub. Check your internet connection.
					</AlertDescription>
				</Alert>
			)}

			{registryLoading ? (
				<div className="flex items-center justify-center py-16 text-muted-foreground">
					<Loader2 className="h-6 w-6 animate-spin mr-2" />
					Loading registry…
				</div>
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
					{(registry?.addons ?? []).map((addon) => (
						<AddonCard
							key={addon.id}
							addon={addon}
							installedVersion={installedMap.get(addon.id)}
							pending={pending}
							onInstall={handleInstall}
							onUninstall={handleUninstall}
							onUpdate={handleUpdate}
						/>
					))}
					{(registry?.addons ?? []).length === 0 && !registryLoading && (
						<div className="col-span-full flex flex-col items-center justify-center py-16 text-muted-foreground">
							<IconBox className="h-10 w-10 mb-3 opacity-30" />
							<p>No addons in registry</p>
						</div>
					)}
				</div>
			)}

			{registry && (
				<p className="text-xs text-slate-600 text-right">
					Registry v{registry.version} · Updated {registry.updatedAt}
				</p>
			)}
		</div>
	);
}
