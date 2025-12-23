import { T } from "src/locale";
import { Badge } from "src/components/ui/badge";

interface Props {
	roles: string[];
}
export function RolesFormatter({ roles }: Props) {
	const r = roles || [];
	if (r.length === 0) {
		r[0] = "standard-user";
	}
	return (
		<>
			{r.map((role: string) => (
				<Badge key={role} variant="secondary" className="mr-1 bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-900 dark:text-yellow-100 dark:hover:bg-yellow-800">
					<T id={`role.${role}`} />
				</Badge>
			))}
		</>
	);
}
