import { HasPermission } from "src/components/HasPermission";
import { ADMIN, VIEW } from "src/modules/Permissions";
import TableWrapper from "./TableWrapper";

const Users = () => {
	return (
		<HasPermission section={ADMIN} permission={VIEW} pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default Users;
