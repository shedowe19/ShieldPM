import { T } from "src/locale";
import DefaultSite from "./DefaultSite";

export default function Layout() {
	// Taken from https://preview.tabler.io/settings.html
	// Refer to that when updating this content

	return (
		<div className="container mx-auto py-6">
			<div className="flex flex-col space-y-8 lg:flex-row lg:space-x-12 lg:space-y-0">
				<aside className="-mx-4 lg:w-1/5">
					<nav className="flex space-x-2 lg:flex-col lg:space-x-0 lg:space-y-1 pl-4">
						<h2 className="text-2xl font-bold tracking-tight mb-4 hidden lg:block">
							<T id="settings" />
						</h2>
						<a
							href="#"
							className="justify-start inline-flex items-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-9 px-4 py-2"
							onClick={(e) => e.preventDefault()}
						>
							<T id="settings.default-site" />
						</a>
					</nav>
				</aside>
				<div className="flex-1 lg:max-w-4xl">
					<DefaultSite />
				</div>
			</div>
		</div>
	);
}
