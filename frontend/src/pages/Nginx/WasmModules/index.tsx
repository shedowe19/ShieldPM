import { HasPermission } from "src/components";
import { SETTINGS, VIEW } from "src/modules/Permissions";
import TableWrapper from "./TableWrapper";

const WasmModules = () => {
	return (
		<HasPermission section={SETTINGS} permission={VIEW} pageLoading loadingNoLogo>
			<TableWrapper />
		</HasPermission>
	);
};

export default WasmModules;
