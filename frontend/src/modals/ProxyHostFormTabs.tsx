import { IconGitBranch, IconNote, IconSettings, IconShieldLock, IconTool } from "@tabler/icons-react";
import { Field, type FieldProps } from "formik";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import type { ProxyLocation } from "src/api/backend";
import { GitSyncTab } from "src/components";
import { LocationsFields } from "src/components/Form/LocationsFields";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { intl, T } from "src/locale";
import { FORWARD_SCHEME, PROXY_HOST_TAB } from "src/types/enums";
import ProxyHostAdvancedTab from "./ProxyHostAdvancedTab";
import ProxyHostCacheTab from "./ProxyHostCacheTab";
import ProxyHostDetailsTab from "./ProxyHostDetailsTab";
import ProxyHostMaintenanceTab from "./ProxyHostMaintenanceTab";
import ProxyHostNotesTab from "./ProxyHostNotesTab";
import ProxyHostSecurityTab from "./ProxyHostSecurityTab";
import ProxyHostSslTab from "./ProxyHostSslTab";
import ProxyHostUpstreamPoolTab from "./ProxyHostUpstreamPoolTab";

type Props = {
	errorMessage?: ReactNode;
	hostId: number | null;
	locations: ProxyLocation[];
};

const ProxyHostFormTabs = ({ errorMessage, hostId, locations }: Props) => (
	<Tabs defaultValue={PROXY_HOST_TAB.DETAILS} className="flex-1 flex flex-col min-h-0">
		<div className="px-6 pt-4">
			<TabsList className="w-full justify-start flex-wrap h-auto gap-y-1">
				<TabsTrigger value={PROXY_HOST_TAB.DETAILS}>
					<T id="column.details" />
				</TabsTrigger>
				<TabsTrigger value={PROXY_HOST_TAB.LOCATIONS}>
					<T id="column.custom-locations" />
				</TabsTrigger>
				<TabsTrigger value={PROXY_HOST_TAB.SSL}>
					<T id="column.ssl" />
				</TabsTrigger>
				<TabsTrigger value="upstream-pool">
					<T id="traffic.pool.tab" />
				</TabsTrigger>
				<TabsTrigger value="cache">
					<T id="traffic.cache.tab" />
				</TabsTrigger>
				<TabsTrigger value={PROXY_HOST_TAB.SECURITY} aria-label={intl.formatMessage({ id: "user.security" })}>
					<IconShieldLock size={20} />
				</TabsTrigger>
				<TabsTrigger
					value={PROXY_HOST_TAB.ADVANCED}
					className="ml-auto"
					aria-label={intl.formatMessage({ id: "advanced" })}
				>
					<IconSettings size={20} />
				</TabsTrigger>
				<TabsTrigger
					value={PROXY_HOST_TAB.MAINTENANCE}
					aria-label={intl.formatMessage({ id: "proxy-host.maintenance-mode" })}
				>
					<IconTool size={20} />
				</TabsTrigger>
				<TabsTrigger value={PROXY_HOST_TAB.NOTES} aria-label={intl.formatMessage({ id: "host.note" })}>
					<IconNote size={20} />
				</TabsTrigger>
				<Field name="forwardScheme">
					{({ field: schemeField }: FieldProps) =>
						schemeField.value === FORWARD_SCHEME.PATH && (
							<TabsTrigger
								value={PROXY_HOST_TAB.GIT_SYNC}
								className="text-emerald-500"
								aria-label={intl.formatMessage({ id: "proxy-host.git-sync" })}
							>
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
				<ProxyHostUpstreamPoolTab hostId={hostId} />
				<ProxyHostCacheTab hostId={hostId} />
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
