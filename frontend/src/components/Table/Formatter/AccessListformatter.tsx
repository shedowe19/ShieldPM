import type { AccessList } from "src/api/backend";
import { Button } from "src/components/ui/button";
import { T } from "src/locale";
import { showAccessListModal } from "src/modals";

interface Props {
	access?: AccessList;
}
export function AccessListFormatter({ access }: Props) {
	if (!access) {
		return <T id="public" />;
	}
	return (
		<Button
			type="button"
			variant="ghost"
			size="sm"
			className="h-auto p-0 px-2 font-normal hover:bg-muted"
			onClick={(e) => {
				e.preventDefault();
				showAccessListModal(access?.id || 0);
			}}
		>
			{access.name}
		</Button>
	);
}
