import { IconMoon, IconSun } from "@tabler/icons-react";
import cn from "classnames";
import { Button } from "src/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { useTheme } from "src/hooks/useTheme";
import { T } from "src/locale";
import { APP_THEME } from "src/types/enums";

interface Props {
	className?: string;
}
function ThemeSwitcher({ className }: Props) {
	const { setTheme } = useTheme();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className={cn("h-8 w-8 px-0", className)}>
					<IconSun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
					<IconMoon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
					<span className="sr-only">
						<T id="sr.toggle-theme" />
					</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuItem onClick={() => setTheme(APP_THEME.LIGHT)}>
					<IconSun className="mr-2 h-4 w-4" />
					<span>
						<T id="theme.light" />
					</span>
				</DropdownMenuItem>
				<DropdownMenuItem onClick={() => setTheme(APP_THEME.DARK)}>
					<IconMoon className="mr-2 h-4 w-4" />
					<span>
						<T id="theme.dark" />
					</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { ThemeSwitcher };
