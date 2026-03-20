import { IconInfoCircle } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "src/components/ui/dialog";
import { ScrollArea } from "src/components/ui/scroll-area";
import { getLocale, T } from "src/locale";

interface Props extends InnerModalProps {
	section: string;
	color?: string;
}

const helpDocLoaders = import.meta.glob("../locale/HelpDoc/*/*.md", {
	query: "?raw",
	import: "default",
});

const fallbackLang = "en";

const loadHelpFile = async (lang: string, section: string): Promise<string> => {
	const candidates = [`../locale/HelpDoc/${lang}/${section}.md`, `../locale/HelpDoc/${fallbackLang}/${section}.md`];

	for (const candidate of candidates) {
		const loader = helpDocLoaders[candidate];
		if (loader) {
			return (await loader()) as string;
		}
	}

	throw new Error(`Cannot load help doc for ${lang}-${section}`);
};

const showHelpModal = (section: string, color?: string) => {
	EasyModal.show(HelpModal, { section, color });
};

const HelpModal = EasyModal.create(({ section, visible, remove }: Props) => {
	const [markdownText, setMarkdownText] = useState("");
	const lang = getLocale(true);

	useEffect(() => {
		let active = true;

		const run = async () => {
			try {
				const doc = await loadHelpFile(lang, section);
				if (active) {
					setMarkdownText(doc);
				}
			} catch (ex) {
				if (active && ex instanceof Error) {
					setMarkdownText(`**ERROR:** ${ex.message}`);
				}
			}
		};

		void run();
		return () => {
			active = false;
		};
	}, [lang, section]);

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-2xl">
				<ScrollArea className="max-h-[80vh]">
					<div className="p-2">
						<ReactMarkdown
							components={{
								h2: ({ children }) => (
									<div className="flex items-center gap-2 mb-6 pb-2 border-b">
										<IconInfoCircle className="h-6 w-6 text-primary" />
										<h2 className="text-xl font-semibold tracking-tight">{children}</h2>
									</div>
								),
								p: ({ children }) => (
									<p className="mb-4 leading-relaxed text-muted-foreground">{children}</p>
								),
								ul: ({ children }) => (
									<ul className="list-disc pl-6 mb-4 space-y-2 text-muted-foreground">{children}</ul>
								),
								li: ({ children }) => <li>{children}</li>,
								strong: ({ children }) => (
									<span className="font-semibold text-foreground">{children}</span>
								),
							}}
						>
							{markdownText}
						</ReactMarkdown>
					</div>
				</ScrollArea>
				<DialogFooter>
					<Button type="button" variant="outline" onClick={remove}>
						<T id="action.close" />
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
});

export { showHelpModal };
