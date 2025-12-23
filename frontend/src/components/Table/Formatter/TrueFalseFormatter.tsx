import { Badge } from "src/components/ui/badge";
import { T } from "src/locale";
import { cn } from "src/lib/utils";

interface Props {
	value: boolean;
	trueLabel?: string;
	trueColor?: string;
	falseLabel?: string;
	falseColor?: string;
}
export function TrueFalseFormatter({
	value,
	trueLabel = "enabled",
	falseLabel = "disabled",
}: Props) {
	// Map simple color names to variants or classes if needed
	// For now assume trueColor/falseColor map to badge variants or use default logic

	// Better approach: use specific classes for success/failure if Badge variants aren't enough
	// But let's try to stick to variants.
	// "enabled" usually green. Shadcn doesn't have "success" variant by default.
	// I'll use "outline" with specific text color or "secondary".
	// Or just "default" for enabled (black) and "destructive" for disabled (red).
	// But users might prefer Green for enabled.

	const badgeClass = value
		? "bg-green-100 text-green-800 hover:bg-green-100/80 dark:bg-green-900 dark:text-green-300"
		: undefined; // Default destructive handles red

	return (
		<Badge variant={value ? "outline" : "destructive"} className={cn("font-normal", value && badgeClass)}>
			<span className={cn("mr-1.5 h-2 w-2 rounded-full", value ? "bg-green-600 dark:bg-green-400" : "bg-white")} />
			<T id={value ? trueLabel : falseLabel} />
		</Badge>
	);
}
