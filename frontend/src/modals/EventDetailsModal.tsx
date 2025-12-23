import { IconCode, IconListDetails } from "@tabler/icons-react";
import CodeEditor from "@uiw/react-textarea-code-editor";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { EventFormatter, GravatarFormatter, Loading } from "src/components";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { useAuditLog } from "src/hooks";
import { T } from "src/locale";

const showEventDetailsModal = (id: number) => {
	EasyModal.show(EventDetailsModal, { id });
};

interface Props extends InnerModalProps {
	id: number;
}
const EventDetailsModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useAuditLog(id);

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
				{!isLoading && error && (
					<Alert variant="destructive" className="mb-4">
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{error?.message || "Unknown error"}</AlertDescription>
					</Alert>
				)}
				{isLoading && <Loading noLogo />}
				{!isLoading && data && (
					<>
						<DialogHeader>
							<DialogTitle className="flex items-center gap-2">
								<IconListDetails className="h-5 w-5" />
								<T id="action.view-details" />
							</DialogTitle>
						</DialogHeader>

						<div className="py-6 space-y-6">
							{/* Header Section */}
							<div className="flex items-start gap-4 p-4 rounded-lg border bg-card/50 shadow-sm">
								<GravatarFormatter url={data.user?.avatar || ""} />
								<EventFormatter row={data} />
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
										<IconCode className="h-4 w-4" />
										Metadata
									</h4>
								</div>
								<div className="rounded-lg border bg-muted/50 overflow-hidden shadow-inner">
									<CodeEditor
										language="json"
										padding={20}
										data-color-mode="dark"
										minHeight={200}
										style={{
											fontFamily: "JetBrains Mono, Fira Code, Consolas, monospace",
											fontSize: 13,
											backgroundColor: "transparent",
											lineHeight: 1.5,
										}}
										readOnly
										value={JSON.stringify(data.meta, null, 2)}
									/>
								</div>
							</div>
						</div>

						<DialogFooter>
							<Button onClick={remove} variant="outline" className="w-full sm:w-auto">
								<T id="action.close" />
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
});

export { showEventDetailsModal };
