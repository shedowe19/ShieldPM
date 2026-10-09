import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "src/components/ui/dialog";
import { T } from "src/locale";

interface ShowProps {
	title?: ReactNode;
	tTitle?: string;
	children: ReactNode;
	onConfirm: () => Promise<void> | void;
	invalidations?: QueryKey[];
}

type Props = InnerModalProps & ShowProps;

const showDeleteConfirmModal = (props: ShowProps) => {
	EasyModal.show(DeleteConfirmModal, props);
};

const DeleteConfirmModal = EasyModal.create(
	({ title, tTitle, children, onConfirm, invalidations, visible, remove }: Props) => {
		const queryClient = useQueryClient();
		const [error, setError] = useState<ReactNode | null>(null);
		const [isSubmitting, setIsSubmitting] = useState(false);
		const [confirmed, setConfirmed] = useState(false);

		const onSubmit = async () => {
			if (isSubmitting || confirmed) return;
			setIsSubmitting(true);
			setError(null);
			try {
				await onConfirm();
				setConfirmed(true);
				await Promise.all((invalidations ?? []).map((queryKey) => queryClient.invalidateQueries({ queryKey })));
				remove();
			} catch (err) {
				setError(<T id={err instanceof Error ? err.message : "error.unknown"} />);
			} finally {
				setIsSubmitting(false);
			}
		};

		return (
			<Dialog open={visible} onOpenChange={(open) => !open && !isSubmitting && remove()}>
				<DialogContent className="sm:max-w-[425px]">
					<DialogHeader>
						<DialogTitle>{tTitle ? <T id={tTitle} /> : title ? title : null}</DialogTitle>
						<DialogDescription>
							{/* Description is required for accessibility, but children implies content.
                                Leaving empty if children is provided in body
                            */}
						</DialogDescription>
					</DialogHeader>

					{error && (
						<Alert variant="destructive" className="mb-4">
							<AlertCircle className="h-4 w-4" />
							<AlertTitle>Error</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<div className="flex flex-col items-center justify-center text-center p-4">
						<AlertTriangle className="h-12 w-12 text-destructive mb-4" />
						<div className="text-center">{children}</div>
					</div>

					<DialogFooter>
						<Button variant="outline" onClick={remove} disabled={isSubmitting}>
							<T id={confirmed ? "action.close" : "cancel"} />
						</Button>
						<Button variant="destructive" onClick={onSubmit} disabled={isSubmitting || confirmed}>
							{isSubmitting ? "..." : <T id="action.delete" />}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		);
	},
);

export { showDeleteConfirmModal };
