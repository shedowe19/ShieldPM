import { HasPermission } from "src/components";
import { PROXY_HOSTS, VIEW } from "src/modules/Permissions";
import TerminalHostTable from "./TerminalHostTable";

const TerminalHosts = () => {
    return (
        <HasPermission section={PROXY_HOSTS} permission={VIEW} pageLoading loadingNoLogo>
            <TerminalHostTable />
        </HasPermission>
    );
};

export default TerminalHosts;
