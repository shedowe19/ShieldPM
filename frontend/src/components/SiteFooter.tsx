import { useCheckVersion, useHealth } from "src/hooks";
import { T } from "src/locale";

export function SiteFooter() {
	const health = useHealth();
	const { data: versionData } = useCheckVersion();

	const getVersion = () => {
		if (!health.data) {
			return "";
		}
		return health.data.version;
	};

	return (
		<footer className="border-t py-4 print:hidden">
			<div className="container mx-auto px-4">
				<div className="flex flex-col-reverse items-center justify-between gap-4 md:flex-row">
					<div className="flex gap-4">
						<span className="text-sm text-muted-foreground">
							Powered by{" "}
							<a
								href="https://github.com/shedowe19/ShieldPM"
								target="_blank"
								rel="noreferrer"
								className="font-medium underline underline-offset-4 hover:text-primary"
							>
								ShieldPM
							</a>
						</span>
						<span className="text-sm text-muted-foreground">
							&copy; 2026 ShieldPM. Private & Internal Use Only.
						</span>
						<span className="text-sm text-muted-foreground">
							Theme by{" "}
							<a
								href="https://ui.shadcn.com"
								target="_blank"
								rel="noreferrer"
								className="font-medium underline underline-offset-4 hover:text-primary"
							>
								shadcn/ui
							</a>
						</span>
						<a
							href={`https://github.com/shedowe19/ShieldPM/releases/tag/v${getVersion()}`}
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm font-medium underline underline-offset-4 hover:text-primary"
						>
							{getVersion()}
						</a>
						{versionData?.updateAvailable && versionData?.latest && (
							<a
								href={`https://github.com/shedowe19/ShieldPM/releases/tag/v${versionData.latest}`}
								target="_blank"
								rel="noopener noreferrer"
								className="text-sm font-bold text-yellow-500 hover:text-yellow-600"
								title={`New version ${versionData.latest} is available`}
							>
								<T id="update-available" data={{ latestVersion: versionData.latest }} />
							</a>
						)}
					</div>

				</div>
			</div>
		</footer>
	);
}
