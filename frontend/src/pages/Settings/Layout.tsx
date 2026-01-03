import { useState } from "react";
import { T } from "src/locale";
import DefaultSite from "./DefaultSite";
import { IconSettings, IconRobot } from "@tabler/icons-react";
import AiConfigPage from "./Ai";

export default function Layout() {
	const [activeTab, setActiveTab] = useState<"default-site" | "ai">("default-site");

	return (
		<div className="container mx-auto py-6">
			<div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
				<aside className="-mx-4 lg:w-1/5">
					<nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1 pl-4">
						<h2 className="text-2xl font-bold tracking-tight mb-4 hidden lg:block">
							<T id="settings" />
						</h2>
						<button
							className={`justify-start inline-flex items-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2 w-full ${activeTab === "default-site" ? "bg-secondary text-secondary-foreground" : "hover:bg-transparent hover:underline"}`}
							onClick={() => setActiveTab("default-site")}
						>
							<IconSettings className="mr-2 h-4 w-4" />
							<T id="settings.default-site" />
						</button>
						<button
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
