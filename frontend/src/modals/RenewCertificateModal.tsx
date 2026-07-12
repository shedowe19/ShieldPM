import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { renewCertificate } from "src/api/backend";
import { Loading } from "src/components";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { useCertificate } from "src/hooks";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

interface Props extends InnerModalProps {
	id: number;
}

const showRenewCertificateModal = (id: number) => {
	EasyModal.show(RenewCertificateModal, { id });
};

const RenewCertificateModal = EasyModal.create(({ id, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const { data, isLoading, error } = useCertificate(id);
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isFresh, setIsFresh] = useState(true);
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		if (!data || !isFresh || isSubmitting) return;
		setIsFresh(false);
		setIsSubmitting(true);

		renewCertificate(id)
			.then(() => {
				showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.CERTIFICATE, "renewed");
				queryClient.invalidateQueries({ queryKey: ["certificates"] });
				remove();
			})
			.catch((err: unknown) => {
				setErrorMsg(<T id={err instanceof Error ? err.message : "error.unknown"} />);
			})
			.finally(() => {
				setIsSubmitting(false);
			});
	}, [id, data, isFresh, isSubmitting, remove, queryClient]);

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && !isSubmitting && remove()}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						<T id="certificate.renew" />
					</DialogTitle>
				</DialogHeader>

				<div className="py-4 space-y-4">
					{errorMsg && (
						<Alert variant="destructive">
							<AlertTitle>
								<T id="error.title" />
							</AlertTitle>
							<AlertDescription>{errorMsg}</AlertDescription>
						</Alert>
					)}

					{isLoading && <Loading noLogo />}

					{!isLoading && error && (
						<Alert variant="destructive">
							<AlertTitle>
								<T id="error.title" />
							</AlertTitle>
							<AlertDescription>{error?.message || <T id="error.unknown" />}</AlertDescription>
						</Alert>
					)}

					{data && isSubmitting && !errorMsg ? (
						<div className="flex flex-col items-center justify-center py-4 space-y-2">
							<Loader2 className="h-8 w-8 animate-spin text-primary" />
							<p className="text-sm text-muted-foreground">
								<T id="certificate.renew.waiting" />
							</p>
						</div>
					) : null}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={remove} disabled={isSubmitting}>
						<T id="action.close" />
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
});

export { showRenewCertificateModal };
