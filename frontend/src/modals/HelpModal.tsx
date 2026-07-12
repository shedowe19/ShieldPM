import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { lazy, Suspense } from "react";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter } from "src/components/ui/dialog";
import { ScrollArea } from "src/components/ui/scroll-area";
import { T } from "src/locale";
import { HelpContentBoundary } from "./HelpContentBoundary";

interface Props extends InnerModalProps {
	section: string;
	color?: string;
}

const loadHelpContent = () => import("./HelpContent").then(({ HelpContent }) => ({ default: HelpContent }));
const HelpContent = lazy(loadHelpContent);

const showHelpModal = (section: string, color?: string) => {
	void loadHelpContent().catch(() => undefined);
	EasyModal.show(HelpModal, { section, color });
};

const HelpModal = EasyModal.create(({ section, visible, remove }: Props) => {
	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-2xl">
				<ScrollArea className="max-h-[80vh]">
					<div className="p-2">
						<HelpContentBoundary>
							<Suspense fallback={null}>
								<HelpContent section={section} />
							</Suspense>
						</HelpContentBoundary>
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
