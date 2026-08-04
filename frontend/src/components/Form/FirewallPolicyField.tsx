import { IconSettings, IconShield } from "@tabler/icons-react";
import { Field, type FieldProps } from "formik";
import { Link } from "react-router-dom";
import { useFirewallPolicies } from "src/hooks";
import { T } from "src/locale";
import { Alert, AlertDescription } from "../ui/alert";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";

interface Props {
	name?: string;
}

export function FirewallPolicyField({ name = "firewallPolicyId" }: Props) {
	const { data, isLoading, isError } = useFirewallPolicies();

	if (isLoading) return <Skeleton className="h-20 w-full" />;
	if (isError) {
		return (
			<Alert variant="destructive">
				<AlertDescription>
					<T id="firewall-policies.load-error" />
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<div className="rounded-lg border bg-card/50 p-4 space-y-3">
			<div className="flex items-start justify-between gap-4">
				<div className="space-y-1">
					<Label htmlFor={name} className="flex items-center gap-2 text-base">
						<IconShield className="h-4 w-4 text-orange-500" />
						<T id="firewall-policies.host-field" />
					</Label>
					<p className="text-sm text-muted-foreground">
						<T id="firewall-policies.host-field.description" />
					</p>
				</div>
				<Button asChild variant="outline" size="sm">
					<Link to="/nginx/firewall">
						<IconSettings className="mr-2 h-4 w-4" />
						<T id="firewall-policies.manage" />
					</Link>
				</Button>
			</div>
			<Field name={name}>
				{({ field, form }: FieldProps<number | null>) => (
					<Select
						value={field.value ? String(field.value) : "none"}
						onValueChange={(value: string) =>
							form.setFieldValue(name, value === "none" ? null : Number(value))
						}
					>
						<SelectTrigger id={name}>
							<SelectValue placeholder="—" />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="none">
								<T id="firewall-policies.none" />
							</SelectItem>
							{data?.map((policy) => (
								<SelectItem key={policy.id} value={String(policy.id)}>
									{policy.name}
									{policy.enabled ? "" : " (disabled)"}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				)}
			</Field>
		</div>
	);
}
