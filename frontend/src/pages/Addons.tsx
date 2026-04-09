import { useState, useEffect } from "react";
import { Download, Trash, RefreshCw, Package } from "lucide-react";
import { AnimatedPage, SiteHeader, SiteContainer } from "src/components";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "src/components/ui/card";
import { useToast } from "src/hooks/use-toast";
import * as api from "src/api/backend/base";

type Addon = {
	id: string;
	name: string;
	version: string;
	description: string;
	author?: string;
	url?: string;
};

export default function Addons() {
	const { toast } = useToast();
	const [storeAddons, setStoreAddons] = useState<Addon[]>([]);
	const [installedAddons, setInstalledAddons] = useState<Addon[]>([]);
	const [loading, setLoading] = useState(true);
	const [installing, setInstalling] = useState<string | null>(null);

	const fetchData = async () => {
		try {
			setLoading(true);
			const [storeRes, installedRes] = await Promise.all([
				api.get<Addon[]>({ url: "/addons/store" }),
				api.get<Addon[]>({ url: "/addons/installed" })
			]);
			setStoreAddons(storeRes);
			setInstalledAddons(installedRes);
		} catch (err: any) {
			toast({
				title: "Failed to load addons",
				description: err.message,
				variant: "destructive"
			});
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchData();
	}, []);

	const isInstalled = (id: string) => installedAddons.some(a => a.id === id);

	const handleInstall = async (addon: Addon) => {
		setInstalling(addon.id);
		try {
			await api.post({ url: "/addons/install", data: { id: addon.id, url: addon.url } });
			toast({ title: "Addon installed", description: `${addon.name} installed successfully` });
			await fetchData();
            // Force a reload so routing picks up any dynamic UI additions
            window.location.reload();
		} catch (err: any) {
			toast({ title: "Install failed", description: err.message, variant: "destructive" });
		} finally {
			setInstalling(null);
		}
	};

	const handleUninstall = async (id: string) => {
		setInstalling(id);
		try {
			await api.del({ url: `/addons/${id}` });
			toast({ title: "Addon uninstalled" });
			await fetchData();
            // Force a reload so routing removes it
            window.location.reload();
		} catch (err: any) {
			toast({ title: "Uninstall failed", description: err.message, variant: "destructive" });
		} finally {
			setInstalling(null);
		}
	};

	return (
		<AnimatedPage>
			<SiteHeader />
			<SiteContainer>
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-3xl font-bold tracking-tight">Addons</h2>
                        <p className="text-muted-foreground">Manage third-party integrations and extensions.</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={fetchData} disabled={loading}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                </div>

				<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
					{storeAddons.map((addon) => {
						const installed = isInstalled(addon.id);
						const processing = installing === addon.id;

						return (
							<Card key={addon.id} className="flex flex-col border border-border/40 bg-card/60 backdrop-blur-sm shadow-md transition-all hover:shadow-lg dark:hover:shadow-primary/5">
								<CardHeader>
									<div className="flex items-center space-x-2">
										<Package className="h-6 w-6 text-primary" />
										<CardTitle>{addon.name}</CardTitle>
									</div>
									<CardDescription>Version {addon.version}</CardDescription>
								</CardHeader>
								<CardContent className="flex-1">
									<p className="text-sm text-muted-foreground">{addon.description}</p>
									{addon.author && <p className="text-xs text-muted-foreground mt-4">By: {addon.author}</p>}
								</CardContent>
								<CardFooter>
									{installed ? (
										<Button variant="destructive" className="w-full" disabled={processing} onClick={() => handleUninstall(addon.id)}>
											{processing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Trash className="mr-2 h-4 w-4" />}
											Uninstall
										</Button>
									) : (
										<Button className="w-full" disabled={processing} onClick={() => handleInstall(addon)}>
											{processing ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
											Install
										</Button>
									)}
								</CardFooter>
							</Card>
						);
					})}

                    {storeAddons.length === 0 && !loading && (
                        <div className="col-span-full h-40 flex items-center justify-center text-muted-foreground border rounded-lg border-dashed">
                            No addons available in registry.
                        </div>
                    )}
				</div>
			</SiteContainer>
		</AnimatedPage>
	);
}
