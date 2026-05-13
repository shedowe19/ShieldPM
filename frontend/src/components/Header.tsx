import type React from "react";

interface Props {
	title: React.ReactNode;
	icon?: React.ElementType;
}

export function Header({ title, icon: Icon }: Props) {
	return (
		<div className="flex items-center gap-3 p-4 md:p-6 pb-2">
			{Icon && <Icon className="h-6 w-6" />}
			<h1 className="text-xl font-semibold">{title}</h1>
		</div>
	);
}
