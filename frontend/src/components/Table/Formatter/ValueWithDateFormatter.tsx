import { formatDateTime, T } from "src/locale";

interface Props {
	value: string;
	createdOn?: string;
	disabled?: boolean;
}
export function ValueWithDateFormatter({ value, createdOn, disabled }: Props) {
	return (
		<div className="flex-1">
			<div className="font-medium">
				<div className={`font-medium ${disabled ? "text-destructive" : ""}`}>{value}</div>
			</div>
			{createdOn ? (
				<div className={`text-muted-foreground text-xs mt-1 ${disabled ? "text-destructive" : ""}`}>
					<T id={disabled ? "disabled" : "created-on"} data={{ date: formatDateTime(createdOn) }} />
				</div>
			) : null}
		</div>
	);
}
