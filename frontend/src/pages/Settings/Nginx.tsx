import { Label } from "src/components/ui/label";
import { Switch } from "src/components/ui/switch";
import { useNginxOptions } from "src/hooks/useRuntimeOptions";
import { T } from "src/locale";
import OptionsCard from "./OptionsCard";

export default function Nginx() {
	const options = useNginxOptions();
	return (
		<OptionsCard {...options} title="settings.nginx.title" valid={() => true}>
			{(values, change, pending) => (
				<>
					<div className="flex items-center gap-2">
						<Switch
							id="nginxBeautifierEnabled"
							checked={values.beautifierEnabled}
							disabled={pending}
							onCheckedChange={(beautifierEnabled) => change({ beautifierEnabled })}
						/>
						<Label htmlFor="nginxBeautifierEnabled">
							<T id="settings.nginx.beautifier-enabled" />
						</Label>
					</div>
					<p className="text-sm text-muted-foreground">
						<T id="settings.nginx.beautifier-description" />
					</p>
				</>
			)}
		</OptionsCard>
	);
}
