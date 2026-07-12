import { IconCode, IconCopy, IconListDetails } from "@tabler/icons-react";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { EventFormatter, Loading, UserAvatar } from "src/components";
import { LazyCodeEditor } from "src/components/LazyCodeEditor";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { useAuditLog, useHealth } from "src/hooks";
import { toast } from "src/hooks/use-toast";
import { intl, T } from "src/locale";

const showEventDetailsModal = (id: number) => {
	EasyModal.show(EventDetailsModal, { id });
};

interface Props extends InnerModalProps {
	id: number;
}
const EventDetailsModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const { data, isLoading, error } = useAuditLog(id);
	const health = useHealth();

	const maskSensitiveData = (obj: unknown): unknown => {
		if (!health.data?.demo) return obj;
		if (typeof obj !== "object" || obj === null) return obj;

		if (Array.isArray(obj)) {
			return obj.map(maskSensitiveData);
		}

		const masked = { ...(obj as Record<string, unknown>) };
		const sensitiveKeys = ["ip", "client_ip", "remote_addr", "address", "ip_address"];

		for (const key in masked) {
			if (sensitiveKeys.includes(key.toLowerCase())) {
				masked[key] = intl.formatMessage({ id: "audit-log.hidden-demo" });
			} else {
				masked[key] = maskSensitiveData(masked[key]);
			}
		}
		return masked;
	};
	const metadata = data ? JSON.stringify(maskSensitiveData(data.meta), null, 2) : "";
	const showCopyError = () => {
		toast({
			description: intl.formatMessage({ id: "audit-log.copy-metadata.failed" }),
			variant: "destructive",
		});
	};
	const copyMetadata = () => {
		if (!navigator.clipboard) {
			showCopyError();
			return;
		}

		void navigator.clipboard.writeText(metadata).catch(showCopyError);
	};

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
				{!isLoading && error && (
					<Alert variant="destructive" className="mb-4">
						<AlertTitle>
							<T id="error.title" />
						</AlertTitle>
						<AlertDescription>{error?.message || <T id="error.unknown" />}</AlertDescription>
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
								<UserAvatar url={data.user?.avatar || ""} />
								<EventFormatter row={data} />
							</div>

							<div className="space-y-2">
								<div className="flex items-center justify-between">
									<h4 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
										<IconCode className="h-4 w-4" />
										<T id="audit-log.metadata" />
									</h4>
									<Button
										aria-label={intl.formatMessage({ id: "audit-log.copy-metadata" })}
										onClick={copyMetadata}
										size="icon"
										title={intl.formatMessage({ id: "audit-log.copy-metadata" })}
										type="button"
										variant="ghost"
									>
										<IconCopy className="h-4 w-4" />
										<span className="sr-only">
											<T id="audit-log.copy-metadata" />
										</span>
									</Button>
								</div>
								<div className="rounded-lg border bg-muted/50 overflow-hidden shadow-inner">
									<LazyCodeEditor
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
										value={metadata}
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
