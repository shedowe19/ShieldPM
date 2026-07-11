import { SSLCertificateField, SSLOptionsFields } from "src/components";
import { TabsContent } from "src/components/ui/tabs";
import { PROXY_HOST_TAB } from "src/types/enums";

const ProxyHostSslTab = () => (
	<TabsContent value={PROXY_HOST_TAB.SSL} className="mt-0">
		<SSLCertificateField name="certificateId" label="ssl-certificate" allowNew />
		<SSLOptionsFields color="bg-lime" />
	</TabsContent>
);

export default ProxyHostSslTab;
