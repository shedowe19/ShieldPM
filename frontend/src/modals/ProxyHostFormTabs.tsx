import { IconGitBranch, IconNote, IconSettings, IconShieldLock, IconTool } from "@tabler/icons-react";
import { Field, type FieldProps } from "formik";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { ProxyLocation } from "src/api/backend";
import { GitSyncTab } from "src/components";
import { LocationsFields } from "src/components/Form/LocationsFields";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { T } from "src/locale";
import { FORWARD_SCHEME, PROXY_HOST_TAB } from "src/types/enums";
import ProxyHostAdvancedTab from "./ProxyHostAdvancedTab";
import ProxyHostDetailsTab from "./ProxyHostDetailsTab";
import ProxyHostMaintenanceTab from "./ProxyHostMaintenanceTab";
import ProxyHostNotesTab from "./ProxyHostNotesTab";
import ProxyHostSecurityTab from "./ProxyHostSecurityTab";
import ProxyHostSslTab from "./ProxyHostSslTab";

type Props = {
	errorMessage?: ReactNode;
	hostId: number | null;
	locations: ProxyLocation[];
};

const ProxyHostFormTabs = ({ errorMessage, hostId, locations }: Props) => (
	<Tabs defaultValue={PROXY_HOST_TAB.DETAILS} className="flex-1 flex flex-col min-h-0">
		<div className="px-6 pt-4">
			<TabsList className="w-full justify-start">
				<TabsTrigger value={PROXY_HOST_TAB.DETAILS}>
					<T id="column.details" />
				</TabsTrigger>
				<TabsTrigger value={PROXY_HOST_TAB.LOCATIONS}>
					<T id="column.custom-locations" />
				</TabsTrigger>
				<TabsTrigger value={PROXY_HOST_TAB.SSL}>
					<T id="column.ssl" />
				</TabsTrigger>
				<TabsTrigger value={PROXY_HOST_TAB.SECURITY}>
					<IconShieldLock size={20} />
				</TabsTrigger>
				<TabsTrigger value={PROXY_HOST_TAB.ADVANCED} className="ml-auto">
					<IconSettings size={20} />
				</TabsTrigger>
				<TabsTrigger value={PROXY_HOST_TAB.MAINTENANCE}>
					<IconTool size={20} />
				</TabsTrigger>
				<TabsTrigger value={PROXY_HOST_TAB.NOTES}>
					<IconNote size={20} />
				</TabsTrigger>
				<Field name="forwardScheme">
					{({ field: schemeField }: FieldProps) =>
						schemeField.value === FORWARD_SCHEME.PATH && (
							<TabsTrigger value={PROXY_HOST_TAB.GIT_SYNC} className="text-emerald-500">
								<IconGitBranch size={20} />
							</TabsTrigger>
						)
					}
				</Field>
			</TabsList>
		</div>

		<div className="flex-1 overflow-y-auto">
			<div className="px-6 py-4">
				{errorMessage && (
					<Alert variant="destructive" className="mb-4">
						<AlertCircle className="h-4 w-4" />
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{errorMessage}</AlertDescription>
					</Alert>
				)}
				<ProxyHostDetailsTab />
				<TabsContent value={PROXY_HOST_TAB.LOCATIONS} className="mt-0">
					<LocationsFields initialValues={locations} />
				</TabsContent>
				<ProxyHostSslTab />
				<ProxyHostSecurityTab />
				<ProxyHostAdvancedTab />
				<ProxyHostMaintenanceTab />
				<ProxyHostNotesTab />
				<Field name="forwardScheme">
					{({ field: schemeField }: FieldProps) =>
						schemeField.value === FORWARD_SCHEME.PATH && (
							<TabsContent value={PROXY_HOST_TAB.GIT_SYNC} className="mt-0 space-y-4">
								<GitSyncTab hostId={hostId} />
							</TabsContent>
						)
					}
				</Field>
			</div>
		</div>
	</Tabs>
);

export default ProxyHostFormTabs;
