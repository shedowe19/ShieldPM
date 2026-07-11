import { useFormikContext } from "formik";
import type { AccessListClient, AccessListItem } from "src/api/backend";
import { Tabs, TabsList, TabsTrigger } from "src/components/ui/tabs";
import { T } from "src/locale";
import { ACCESS_LIST_AUTH_TYPE, ACCESS_LIST_TAB } from "src/types/enums";
import AccessListAuthorizationTabs from "./AccessListAuthorizationTabs";
import AccessListDetailsTab from "./AccessListDetailsTab";
import type { AccessListFormValues } from "./AccessListModalFormValues";
import AccessListMtlsTab from "./AccessListMtlsTab";
import AccessListSsoTab from "./AccessListSsoTab";

type Props = {
	clients: AccessListClient[];
	items: AccessListItem[];
};

const AccessListFormTabs = ({ clients, items }: Props) => {
	const { values } = useFormikContext<AccessListFormValues>();
	const isSsoEnabled = !!(values.authType && values.authType !== ACCESS_LIST_AUTH_TYPE.NONE);

	return (
		<Tabs defaultValue={ACCESS_LIST_TAB.DETAILS} className="w-full">
			<TabsList className="grid w-full grid-cols-5">
				<TabsTrigger value={ACCESS_LIST_TAB.DETAILS}>
					<T id="column.details" />
				</TabsTrigger>
				<TabsTrigger value={ACCESS_LIST_TAB.AUTH}>
					<T id="column.authorizations" />
				</TabsTrigger>
				<TabsTrigger value={ACCESS_LIST_TAB.RULES}>
					<T id="column.rules" />
				</TabsTrigger>
				<TabsTrigger value={ACCESS_LIST_TAB.SSO}>
					<T id="access-list.sso" />
				</TabsTrigger>
				<TabsTrigger value={ACCESS_LIST_TAB.MTLS}>
					<T id="access-list.mtls.tab" />
				</TabsTrigger>
			</TabsList>

			<AccessListDetailsTab />
			<AccessListAuthorizationTabs clients={clients} isSsoEnabled={isSsoEnabled} items={items} />
			<AccessListSsoTab />
			<AccessListMtlsTab />
		</Tabs>
	);
};

export default AccessListFormTabs;
