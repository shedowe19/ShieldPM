import { Monitor, Shield } from "lucide-react";
import { useState } from "react";
import { T } from "src/locale";
import SecuritySettings from "./Security";
import SessionsSettings from "./Sessions";

type ProfileTab = "security" | "sessions";

export default function Profile() {
	const [activeTab, setActiveTab] = useState<ProfileTab>("security");

	return (
		<div className="container mx-auto py-6">
			<div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
				<aside className="-mx-4 lg:w-1/5">
					<nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1 pl-4">
						<h2 className="text-2xl font-bold tracking-tight mb-4 hidden lg:block">Profile</h2>
						<button
							type="button"
							onClick={() => setActiveTab("security")}
							className={`justify-start inline-flex items-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2 w-full ${activeTab === "security" ? "bg-secondary text-secondary-foreground" : "hover:bg-transparent hover:underline"}`}
						>
							<Shield className="mr-2 h-4 w-4" />
							Security
						</button>
						<button
							type="button"
							onClick={() => setActiveTab("sessions")}
							className={`justify-start inline-flex items-center rounded-md px-4 py-2 text-sm font-medium ${activeTab === "sessions" ? "bg-secondary text-secondary-foreground" : "hover:underline"}`}
						>
							<Monitor className="mr-2 h-4 w-4" />
							<T id="sessions.title" />
						</button>
					</nav>
				</aside>
				<div className="flex-1 lg:max-w-2xl">
					{activeTab === "security" ? <SecuritySettings /> : <SessionsSettings />}
				</div>
			</div>
		</div>
	);
}
