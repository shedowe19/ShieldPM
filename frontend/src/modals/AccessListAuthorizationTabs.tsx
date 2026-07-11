import { AlertTriangle } from "lucide-react";
import type { AccessListClient, AccessListItem } from "src/api/backend";
import { AccessClientFields, BasicAuthFields } from "src/components";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { TabsContent } from "src/components/ui/tabs";
import { T } from "src/locale";
import { ACCESS_LIST_TAB } from "src/types/enums";

type Props = {
	clients: AccessListClient[];
	isSsoEnabled: boolean;
	items: AccessListItem[];
};

const AccessListAuthorizationTabs = ({ clients, isSsoEnabled, items }: Props) => (
	<>
		<TabsContent value={ACCESS_LIST_TAB.AUTH} className="pt-4">
			{isSsoEnabled && (
				<Alert variant="default" className="mb-4 bg-muted border-primary/20">
					<AlertTriangle className="h-4 w-4 text-primary" />
					<AlertDescription>
						<T id="access-list.sso.authentication-handled" />
					</AlertDescription>
				</Alert>
			)}
			<fieldset disabled={isSsoEnabled} className={isSsoEnabled ? "opacity-50" : ""}>
				<BasicAuthFields initialValues={items} />
			</fieldset>
		</TabsContent>

		<TabsContent value={ACCESS_LIST_TAB.RULES} className="pt-4">
			{isSsoEnabled && (
				<Alert variant="default" className="mb-4 bg-muted border-primary/20">
					<AlertTriangle className="h-4 w-4 text-primary" />
					<AlertDescription>
						<T id="access-list.sso.rules-handled" />
					</AlertDescription>
				</Alert>
			)}
			<fieldset disabled={isSsoEnabled} className={isSsoEnabled ? "opacity-50" : ""}>
				<AccessClientFields initialValues={clients} />
			</fieldset>
		</TabsContent>
	</>
);

export default AccessListAuthorizationTabs;
