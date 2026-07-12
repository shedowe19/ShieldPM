import { Flag } from "src/components/Flag";
import { Button } from "src/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "src/components/ui/dropdown-menu";
import { useLocaleState } from "src/context";
import { changeLocale, getFlagCodeForLocale, localeOptions, T } from "src/locale";

interface Props {
	menuAlign?: "start" | "end";
}

function LocalePicker(_props: Props) {
	const { locale, setLocale } = useLocaleState();

	const changeTo = async (lang: string) => {
		await changeLocale(lang);
		setLocale(lang);
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="ghost" size="icon" className="h-8 w-8 px-0">
					<Flag countryCode={getFlagCodeForLocale(locale)} />
					<span className="sr-only">
						<T id="sr.switch-language" />
					</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="max-h-[300px] overflow-y-auto">
				{localeOptions.map((item) => (
					<DropdownMenuItem
						key={`locale-${item[0]}`}
						onClick={() => changeTo(item[0])}
						className="cursor-pointer"
					>
						<Flag countryCode={getFlagCodeForLocale(item[0])} className="mr-2 h-4 w-4" />
						<span className="flex-1">
							<T id={`locale-${item[1]}`} />
						</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

export { LocalePicker };
