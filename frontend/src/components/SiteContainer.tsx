interface Props {
	children: React.ReactNode;
}

import { useLocation } from "react-router-dom";

export function SiteContainer({ children }: Props) {
	const location = useLocation();
	const isFullWidth = location.pathname === "/analytics";

	const className = isFullWidth
		? "p-4 min-w-0 overflow-x-auto flex-1 w-full"
		: "container mx-auto max-w-7xl p-4 min-w-0 overflow-x-auto flex-1";

	return <div className={className}>{children}</div>;
}
