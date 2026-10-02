import { IconGitBranch, IconRobot, IconSettings, IconShield } from "@tabler/icons-react";
import { Lock } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Loading } from "src/components/Loading";
import { T } from "src/locale";
import { SETTINGS_TAB, type SettingsTab } from "src/types/enums";
import AiConfigPage from "./Ai";
import Certificates from "./Certificates";
import DefaultSite from "./DefaultSite";
import GitOps from "./GitOps";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useHealth } from "@/hooks/useHealth";

const Network = lazy(() => import("./Network"));
const Analytics = lazy(() => import("./Analytics"));
const Nginx = lazy(() => import("./Nginx"));

export default function Layout() {
	const health = useHealth();
	const [activeTab, setActiveTab] = useState<SettingsTab>(SETTINGS_TAB.DEFAULT_SITE);

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
							<p className="mt-2">
								For security reasons, changing global configurations is not permitted.
							</p>
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
					<nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1 pl-4 overflow-x-auto lg:overflow-visible">
						<h2 className="text-2xl font-bold tracking-tight mb-4 hidden lg:block">
							<T id="settings" />
						</h2>
						{[
							{ id: SETTINGS_TAB.DEFAULT_SITE, label: "settings.default-site", Icon: IconSettings },
							{ id: SETTINGS_TAB.AI, label: "AI Agent", Icon: IconRobot },
							{ id: SETTINGS_TAB.GITOPS, label: "settings.gitops", Icon: IconGitBranch },
							{ id: SETTINGS_TAB.CERTIFICATES, label: "settings.certificates.title", Icon: IconShield },
							{ id: SETTINGS_TAB.NETWORK, label: "settings.network.title", Icon: IconSettings },
							{ id: SETTINGS_TAB.ANALYTICS, label: "settings.analytics.title", Icon: IconSettings },
							{ id: SETTINGS_TAB.NGINX, label: "settings.nginx.title", Icon: IconSettings },
						].map(({ id, label, Icon }) => (
							<button
								key={id}
								type="button"
								className={`justify-start inline-flex items-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2 w-full ${activeTab === id ? "bg-secondary text-secondary-foreground" : "hover:bg-transparent hover:underline"}`}
								onClick={() => setActiveTab(id)}
							>
								<Icon className="mr-2 h-4 w-4" />
								{id === SETTINGS_TAB.AI ? label : <T id={label} />}
							</button>
						))}
					</nav>
				</aside>
				<div className="flex-1 lg:max-w-4xl">
					{activeTab === SETTINGS_TAB.DEFAULT_SITE && <DefaultSite />}
					{activeTab === SETTINGS_TAB.AI && <AiConfigPage />}
					{activeTab === SETTINGS_TAB.GITOPS && <GitOps />}
					{activeTab === SETTINGS_TAB.CERTIFICATES && <Certificates />}
					{activeTab === SETTINGS_TAB.NETWORK && (
						<Suspense fallback={<Loading noLogo />}>
							<Network />
						</Suspense>
					)}
					{activeTab === SETTINGS_TAB.ANALYTICS && (
						<Suspense fallback={<Loading noLogo />}>
							<Analytics />
						</Suspense>
					)}
					{activeTab === SETTINGS_TAB.NGINX && (
						<Suspense fallback={<Loading noLogo />}>
							<Nginx />
						</Suspense>
					)}
				</div>
			</div>
		</div>
	);
}
