import { IconGhost, IconShieldLock } from "@tabler/icons-react";
import { Field, type FieldProps } from "formik";
import AnubisRulesField from "src/components/AnubisRulesField";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Switch } from "src/components/ui/switch";
import { TabsContent } from "src/components/ui/tabs";
import { intl, T } from "src/locale";
import { PROXY_HOST_TAB, TIME_UNIT } from "src/types/enums";
import type { ProxyHostFormValues } from "./ProxyHostModalFormValues";

const DEFAULT_ANUBIS_RULES = [
	{
		name: "block-ai-crawlers",
		path: ".*",
		action: "DENY",
		userAgent:
			"(?i)GPTBot|CCBot|PerplexityBot|Anthropic-ai|Claude-Web|Google-Extended|Bytespider|Amazonbot|FacebookBot",
	},
	{
		name: "challenge-browsers",
		path: ".*",
		action: "CHALLENGE",
		userAgent: "Mozilla",
	},
];

const ProxyHostSecurityTab = () => (
	<TabsContent value={PROXY_HOST_TAB.SECURITY} className="mt-0 space-y-4">
		<Alert variant="default" className="bg-muted/50">
			<IconShieldLock className="h-4 w-4" />
			<AlertTitle>
				<T id="proxy-host.rate-limiting.title" />
			</AlertTitle>
			<AlertDescription>
				<T id="proxy-host.rate-limiting.description" />
			</AlertDescription>
		</Alert>

		<div className="flex items-center justify-between p-4 border rounded-lg bg-card/50">
			<div className="space-y-0.5">
				<div className="flex items-center gap-2">
					<IconShieldLock className="h-4 w-4 text-orange-500" />
					<Label htmlFor="crowdsecEnabled" className="text-base">
						CrowdSec IPS
					</Label>
				</div>
				<p className="text-sm text-muted-foreground">
					Enable CrowdSec Bouncer for this host (Blocks known attackers)
				</p>
			</div>
			<Field name="crowdsecEnabled" type="checkbox">
				{({ field, form }: FieldProps) => (
					<Switch
						id="crowdsecEnabled"
						checked={field.checked}
						onCheckedChange={(checked: boolean) => form.setFieldValue("crowdsecEnabled", checked)}
					/>
				)}
			</Field>
		</div>

		<div className="flex items-center justify-between p-4 border rounded-lg bg-card/50">
			<div className="space-y-0.5">
				<div className="flex items-center gap-2">
					<IconGhost className="h-4 w-4 text-purple-500" />
					<Label htmlFor="anubisEnabled" className="text-base">
						Anubis AI Firewall
					</Label>
				</div>
				<p className="text-sm text-muted-foreground">
					Weighs the soul of incoming HTTP requests to stop AI crawlers
				</p>
			</div>
			<Field name="anubisEnabled" type="checkbox">
				{({ field, form }: FieldProps<boolean, ProxyHostFormValues>) => (
					<Switch
						id="anubisEnabled"
						checked={field.checked}
						onCheckedChange={(checked: boolean) => {
							form.setFieldValue("anubisEnabled", checked);
							if (checked && (!form.values.anubisRules || form.values.anubisRules.length === 0)) {
								form.setFieldValue("anubisRules", DEFAULT_ANUBIS_RULES);
							}
						}}
					/>
				)}
			</Field>
		</div>

		<Field name="anubisEnabled">
			{({ field }: FieldProps) =>
				field.value && (
					<div className="animate-in fade-in slide-in-from-top-2 duration-300">
						<AnubisRulesField />
					</div>
				)
			}
		</Field>

		<div className="grid grid-cols-12 gap-4">
			<div className="col-span-12 md:col-span-4">
				<Field name="advLimitReqRate">
					{({ field, form }: FieldProps) => (
						<div className="space-y-2">
							<Label htmlFor="advLimitReqRate">
								<T id="proxy-host.rate-limiting.rate" />
							</Label>
							<Input
								id="advLimitReqRate"
								type="number"
								min={0}
								placeholder={intl.formatMessage({ id: "proxy-host.rate-limiting.rate.placeholder" })}
								className={
									form.errors.advLimitReqRate && form.touched.advLimitReqRate
										? "border-destructive"
										: ""
								}
								{...field}
							/>
						</div>
					)}
				</Field>
			</div>
			<div className="col-span-12 md:col-span-4">
				<Field name="advLimitReqUnit">
					{({ field, form }: FieldProps) => (
						<div className="space-y-2">
							<Label htmlFor="advLimitReqUnit">
								<T id="proxy-host.rate-limiting.unit" />
							</Label>
							<Select
								onValueChange={(val: string) => form.setFieldValue(field.name, val)}
								value={field.value}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value={TIME_UNIT.SECONDS}>
										<T id="proxy-host.rate-limiting.unit.second" />
									</SelectItem>
									<SelectItem value={TIME_UNIT.MINUTES}>
										<T id="proxy-host.rate-limiting.unit.minute" />
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
					)}
				</Field>
			</div>
			<div className="col-span-12 md:col-span-4">
				<Field name="advLimitReqBurst">
					{({ field, form }: FieldProps) => (
						<div className="space-y-2">
							<Label htmlFor="advLimitReqBurst">
								<T id="proxy-host.rate-limiting.burst" />
							</Label>
							<Input
								id="advLimitReqBurst"
								type="number"
								min={0}
								placeholder={intl.formatMessage({ id: "proxy-host.rate-limiting.burst.placeholder" })}
								className={
									form.errors.advLimitReqBurst && form.touched.advLimitReqBurst
										? "border-destructive"
										: ""
								}
								{...field}
							/>
						</div>
					)}
				</Field>
			</div>
		</div>
	</TabsContent>
);

export default ProxyHostSecurityTab;
