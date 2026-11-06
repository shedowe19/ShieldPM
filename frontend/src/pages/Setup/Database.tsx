import { DatabaseForm, databaseText } from "src/components/Database/DatabaseForm";
import { LocalePicker } from "src/components/LocalePicker";
import { ThemeSwitcher } from "src/components/ThemeSwitcher";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "src/components/ui/card";

export default function DatabaseSetup() {
	return (
		<div className="flex min-h-screen flex-col items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-background">
			<div className="absolute top-4 right-4 flex gap-2">
				<LocalePicker />
				<ThemeSwitcher />
			</div>
			<div className="w-full max-w-md space-y-8">
				<div className="flex justify-center">
					<img
						className="h-12 w-auto dark:invert"
						src="/images/logo-text-horizontal-grey.png"
						alt="ShieldPM"
					/>
				</div>
				<Card>
					<CardHeader className="text-center">
						<CardTitle className="text-2xl">{databaseText("setup-title")}</CardTitle>
						<CardDescription>{databaseText("setup-description")}</CardDescription>
					</CardHeader>
					<CardContent>
						<DatabaseForm kind="setup" engines={["sqlite", "mysql2", "pg"]} />
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
