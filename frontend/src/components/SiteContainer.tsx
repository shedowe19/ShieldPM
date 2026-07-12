import type * as React from "react";
import { useLocation } from "react-router-dom";

interface Props {
	children: React.ReactNode;
}

export function SiteContainer({ children }: Props) {
	const location = useLocation();
	const isFullWidth =
		location.pathname === "/analytics" ||
		location.pathname === "/" ||
		location.pathname === "/access" ||
		location.pathname === "/certificates" ||
		location.pathname === "/users" ||
		location.pathname === "/audit-log" ||
		location.pathname === "/settings" ||
		location.pathname.startsWith("/nginx/");

	const className = isFullWidth
		? "p-4 min-w-0 overflow-x-auto flex-1 w-full"
		: "container mx-auto max-w-7xl p-4 min-w-0 overflow-x-auto flex-1";

	return (
		<main id="app-content" data-testid="app-content" tabIndex={-1} className={className}>
			{children}
		</main>
	);
}
