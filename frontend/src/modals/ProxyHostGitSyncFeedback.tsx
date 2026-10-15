import { useFormikContext } from "formik";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { T } from "src/locale";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";

// Keep conflict resolution outside scheme-specific tabs, so switching the draft
// away from a static site never hides the reason Save is blocked.
export function ProxyHostGitSyncFeedback() {
	const { values, setValues } = useFormikContext<ProxyHostFormValues>();
	if (values.gitSyncPending)
		return (
			<Alert>
				<AlertDescription>
					<T id="proxy-host.git-sync.in-progress" />
				</AlertDescription>
			</Alert>
		);
	if (!values.gitSyncConflict) return null;
	return (
		<Alert variant="destructive">
			<AlertDescription>
				<T id="proxy-host.git-sync.root-conflict" />
			</AlertDescription>
			<div className="flex gap-2 mt-2">
				<Button
					type="button"
					onClick={() =>
						setValues((current) => ({
							...current,
							...current.gitSyncConflict,
							gitSyncedRoot: current.gitSyncConflict,
							gitSyncConflict: undefined,
						}))
					}
				>
					<T id="proxy-host.git-sync.use-synced-root" />
				</Button>
				<Button
					type="button"
					variant="outline"
					onClick={() => setValues((current) => ({ ...current, gitSyncConflict: undefined }))}
				>
					<T id="proxy-host.git-sync.keep-draft-root" />
				</Button>
			</div>
		</Alert>
	);
}
