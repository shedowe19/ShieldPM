import type { ReactNode } from "react";
import { Badge } from "src/components/ui/badge";
import { formatDateTime, T } from "src/locale";

interface Props {
	domains: string[];
	createdOn?: string;
	niceName?: string;
	provider?: string;
	color?: string;
}

const DomainLink = ({ domain }: { domain?: string; color?: string }) => {
	if (!domain) return null;

	const isWildcard = domain.includes("*");
	let onClickLink: ((e: React.MouseEvent) => void) | undefined;
	if (isWildcard) {
		onClickLink = (e: React.MouseEvent) => e.preventDefault();
	}

	// Simple color mapping or default to outline/secondary
	// Original colors: lime (green), orange, etc.
	// Since we don't have all mappings, we used generic badges or try to match if possible.
	// For now, let's use outline for domains, and maybe specific classes for known colors if critical.
	// But shadcn Badge variant="outline" is safe.

	return (
		<a
			key={domain}
			href={`http://${domain}`}
			target="_blank"
			rel="noreferrer"
			onClick={onClickLink}
			className="no-underline"
		>
			<Badge variant="outline" className="mr-2 font-mono hover:bg-accent">
				{domain}
			</Badge>
		</a>
	);
};

export function DomainsFormatter({ domains, createdOn, niceName, provider, color }: Props) {
	const elms: ReactNode[] = [];
	if ((!domains || domains.length === 0) && !niceName) {
		elms.push(
			<Badge key="nice-name" variant="destructive" className="mr-2">
				Unknown
			</Badge>,
		);
	}
	if (!domains || (niceName && provider !== "letsencrypt")) {
		elms.push(
			<Badge key="nice-name" variant="secondary" className="mr-2 text-muted-foreground">
				{niceName}
			</Badge>,
		);
	}

	if (domains) {
		domains.map((domain: string) => elms.push(<DomainLink key={domain} domain={domain} color={color} />));
	}

	return (
		<div className="flex-1">
			<div className="font-medium">{...elms}</div>
			{createdOn ? (
				<div className="text-muted-foreground text-sm mt-1">
					<T id="created-on" data={{ date: formatDateTime(createdOn) }} />
				</div>
			) : null}
		</div>
	);
}
