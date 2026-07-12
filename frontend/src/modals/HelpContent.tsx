import { useEffect, useState } from "react";
import { getLocale, T } from "src/locale";
import { getHelpFile } from "src/locale/HelpDoc";
import { HelpMarkdown } from "./HelpMarkdown";

interface Props {
	section: string;
}

export function HelpContent({ section }: Props) {
	const [hasError, setHasError] = useState(false);
	const [markdownText, setMarkdownText] = useState("");
	const lang = getLocale(true);

	useEffect(() => {
		let active = true;
		setHasError(false);
		setMarkdownText("");

		const loadHelp = async () => {
			try {
				const docFile = getHelpFile(lang, section);
				const response = await fetch(docFile);
				if (!response.ok) {
					if (active) setHasError(true);
					return;
				}

				const markdown = await response.text();
				if (active) setMarkdownText(markdown);
			} catch {
				if (active) setHasError(true);
			}
		};

		void loadHelp();

		return () => {
			active = false;
		};
	}, [lang, section]);

	if (hasError) {
		return (
			<p role="alert" className="mb-4 leading-relaxed text-muted-foreground">
				<T id="error.unknown" />
			</p>
		);
	}

	return markdownText ? <HelpMarkdown markdown={markdownText} /> : null;
}
