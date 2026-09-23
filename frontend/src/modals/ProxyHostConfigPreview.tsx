import { useMutation } from "@tanstack/react-query";
import { useFormikContext } from "formik";
import { Eye, Loader2, X } from "lucide-react";
import { useState } from "react";
import { type ProxyHostConfigPreview as PreviewResult, previewProxyHost } from "src/api/backend";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { T } from "src/locale";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";
import { createProxyHostPayload, type ProxyHostPayload } from "./ProxyHostModalSubmission";

type Props = { id: number | "new" };

/** Only display a response for the exact draft that produced it. */
const ProxyHostConfigPreview = ({ id }: Props) => {
	const { values } = useFormikContext<ProxyHostFormValues>();
	const mutation = useMutation<PreviewResult, Error, ProxyHostPayload>({
		mutationFn: (draft) => previewProxyHost(draft),
	});
	const [previewedDraft, setPreviewedDraft] = useState("");
	const [showDiff, setShowDiff] = useState(true);
	const [expanded, setExpanded] = useState(false);
	const payload = createProxyHostPayload({ id, values });
	const draft = JSON.stringify(payload);
	const current = previewedDraft === draft && !mutation.isPending;
	const result = current ? mutation.data : undefined;
	const error = current && mutation.isError ? mutation.error : null;

	return (
		<section className="border-t px-6 py-3">
			<div className="flex flex-wrap items-center gap-2">
				<Button
					type="button"
					variant="outline"
					disabled={mutation.isPending}
					onClick={() => {
						setPreviewedDraft(draft);
						setExpanded(true);
						mutation.mutate(payload);
					}}
				>
					{mutation.isPending ? (
						<Loader2 className="mr-2 h-4 w-4 animate-spin" />
					) : (
						<Eye className="mr-2 h-4 w-4" />
					)}
					<T id="proxy-host.config-preview.action" />
				</Button>
				{expanded && (result || error) && (
					<Button type="button" size="sm" variant="ghost" onClick={() => setExpanded(false)}>
						<X className="mr-1 h-4 w-4" />
						<T id="proxy-host.config-preview.close" />
					</Button>
				)}
			</div>
			{expanded && error && (
				<Alert variant="destructive" className="mt-3">
					<AlertDescription>{error.message}</AlertDescription>
				</Alert>
			)}
			{expanded && result && (
				<div className="mt-3 space-y-2">
					<p className="text-sm text-muted-foreground">
						<T id="proxy-host.config-preview.render-only" />
					</p>
					{result.limitations.includes("id-pending") && (
						<p className="text-sm text-muted-foreground">
							<T id="proxy-host.config-preview.id-pending" />
						</p>
					)}
					{result.limitations.includes("certificate-pending") && (
						<p className="text-sm text-muted-foreground">
							<T id="proxy-host.config-preview.certificate-pending" />
						</p>
					)}
					{id !== "new" && !result.hasCurrent && (
						<p className="text-sm text-muted-foreground">
							<T id="proxy-host.config-preview.no-active" />
						</p>
					)}
					<div className="flex gap-2">
						<Button
							type="button"
							size="sm"
							variant={showDiff ? "secondary" : "ghost"}
							onClick={() => setShowDiff(true)}
						>
							<T id="proxy-host.config-preview.diff" />
						</Button>
						<Button
							type="button"
							size="sm"
							variant={!showDiff ? "secondary" : "ghost"}
							onClick={() => setShowDiff(false)}
						>
							<T id="proxy-host.config-preview.config" />
						</Button>
					</div>
					<pre
						className="max-h-[30vh] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-xs"
						data-testid="host-config-preview"
					>
						{showDiff
							? result.diff.split("\n").map((line, index) => (
									<span
										key={index}
										className={
											line.startsWith("+")
												? "block text-green-700 dark:text-green-400"
												: line.startsWith("-")
													? "block text-red-700 dark:text-red-400"
													: "block"
										}
									>
										{line}
									</span>
								))
							: result.config}
					</pre>
				</div>
			)}
		</section>
	);
};

export default ProxyHostConfigPreview;
