import { HasPermission } from "src/components/HasPermission";
import { ADMIN, VIEW } from "src/modules/Permissions";
import Layout from "./Layout";

const Settings = () => {
	return (
		<HasPermission section={ADMIN} permission={VIEW} pageLoading loadingNoLogo>
			<Layout />
		</HasPermission>
	);
};

export default Settings;
