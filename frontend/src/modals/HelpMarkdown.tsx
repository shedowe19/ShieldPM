import { IconInfoCircle } from "@tabler/icons-react";
import ReactMarkdown from "react-markdown";

interface Props {
	markdown: string;
}

export function HelpMarkdown({ markdown }: Props) {
	return (
		<ReactMarkdown
			components={{
				h2: ({ children }) => (
					<div className="flex items-center gap-2 mb-6 pb-2 border-b">
						<IconInfoCircle className="h-6 w-6 text-primary" />
						<h2 className="text-xl font-semibold tracking-tight">{children}</h2>
					</div>
				),
				p: ({ children }) => <p className="mb-4 leading-relaxed text-muted-foreground">{children}</p>,
				ul: ({ children }) => (
					<ul className="list-disc pl-6 mb-4 space-y-2 text-muted-foreground">{children}</ul>
				),
				li: ({ children }) => <li>{children}</li>,
				strong: ({ children }) => <span className="font-semibold text-foreground">{children}</span>,
			}}
		>
			{markdown}
		</ReactMarkdown>
	);
}
