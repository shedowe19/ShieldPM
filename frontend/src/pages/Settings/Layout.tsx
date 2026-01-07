import { useState } from "react";
import { T } from "src/locale";
import DefaultSite from "./DefaultSite";
import { IconSettings, IconRobot } from "@tabler/icons-react";
import AiConfigPage from "./Ai";
import { useHealth } from "@/hooks/useHealth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Lock } from "lucide-react";

export default function Layout() {
	const health = useHealth();
	const [activeTab, setActiveTab] = useState<"default-site" | "ai">("default-site");

	if (health.data?.demo) {
		return (
			<div className="container mx-auto py-6">
				<Card className="border-t-4 border-red-500/50">
					<CardHeader>
						<CardTitle className="text-2xl font-bold flex items-center gap-2 text-red-500">
							<Lock className="h-6 w-6" />
							Access Denied
						</CardTitle>
					</CardHeader>
					<CardContent>
						<div className="p-8 text-center text-muted-foreground">
							<p className="text-lg font-semibold">Global Settings are disabled in Demo Mode.</p>
							<p className="mt-2">For security reasons, changing global configurations is not permitted.</p>
						</div>
					</CardContent>
				</Card>
			</div>
		);
	}

	return (
		<div className="container mx-auto py-6">
			<div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
				<aside className="-mx-4 lg:w-1/5">
					<nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1 pl-4">
						<h2 className="text-2xl font-bold tracking-tight mb-4 hidden lg:block">
							<T id="settings" />
						</h2>
						<button
							type="button"
							className={`justify-start inline-flex items-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2 w-full ${activeTab === "default-site" ? "bg-secondary text-secondary-foreground" : "hover:bg-transparent hover:underline"}`}
							onClick={() => setActiveTab("default-site")}
						>
							<IconSettings className="mr-2 h-4 w-4" />
							<T id="settings.default-site" />
						</button>
						<button
							type="button"
							className={`justify-start inline-flex items-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2 w-full ${activeTab === "ai" ? "bg-secondary text-secondary-foreground" : "hover:bg-transparent hover:underline"}`}
							onClick={() => setActiveTab("ai")}
						>
							<IconRobot className="mr-2 h-4 w-4" />
							AI Agent
						</button>
					</nav>
				</aside>
				<div className="flex-1 lg:max-w-4xl">
					{activeTab === "default-site" && <DefaultSite />}
					{activeTab === "ai" && <AiConfigPage />}
				</div>
			</div>
		</div>
	);
}
