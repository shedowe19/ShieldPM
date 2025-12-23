interface Props {
	children: React.ReactNode;
}

export function SiteContainer({ children }: Props) {
	return <div className="container mx-auto max-w-7xl p-4 min-w-0 overflow-x-auto flex-1">{children}</div>;
}
