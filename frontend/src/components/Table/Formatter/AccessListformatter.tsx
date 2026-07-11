import type { AccessList } from "src/api/backend";
import { Button } from "src/components/ui/button";
import { T } from "src/locale";

interface Props {
	access?: AccessList;
	onEdit: (id: number) => void;
}
export function AccessListFormatter({ access, onEdit }: Props) {
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
				onEdit(access.id || 0);
			}}
		>
			{access.name}
		</Button>
	);
}
