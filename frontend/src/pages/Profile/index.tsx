import { Shield } from "lucide-react";
import { lazy, Suspense, useState } from "react";
import { Loading } from "src/components";

const SecuritySettings = lazy(() => import("./Security"));

type ProfileTab = "security";

export default function Profile() {
	const [activeTab] = useState<ProfileTab>("security");

	return (
		<div className="container mx-auto py-6">
			<div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
				<aside className="-mx-4 lg:w-1/5">
					<nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1 pl-4">
						<h2 className="text-2xl font-bold tracking-tight mb-4 hidden lg:block">Profile</h2>
						<button
							type="button"
							className={`justify-start inline-flex items-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2 w-full ${activeTab === "security" ? "bg-secondary text-secondary-foreground" : "hover:bg-transparent hover:underline"}`}
						>
							<Shield className="mr-2 h-4 w-4" />
							Security
						</button>
					</nav>
				</aside>
				<div className="flex-1 lg:max-w-2xl">
					<Suspense
						fallback={
							<div className="py-8">
								<Loading />
							</div>
						}
					>
						{activeTab === "security" && <SecuritySettings />}
					</Suspense>
				</div>
			</div>
		</div>
	);
}
