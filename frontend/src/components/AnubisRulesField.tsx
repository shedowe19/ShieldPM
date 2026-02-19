import { IconPlus, IconTrash } from "@tabler/icons-react";
import { FieldArray, useFormikContext } from "formik";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";

interface AnubisRule {
	path: string;
	action: "ALLOW" | "DENY" | "CHALLENGE";
	user_agent?: string;
}

const AnubisRulesField = () => {
	const { values, setFieldValue } = useFormikContext<{ anubisRules: AnubisRule[] }>();
	const rules = values.anubisRules || [];

	return (
		<div className="mt-4 border rounded-md p-4 bg-card">
			<div className="flex items-center justify-between mb-4">
				<h4 className="text-sm font-medium">Anubis Rules</h4>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={() => {
						setFieldValue("anubisRules", [
							...rules,
							{ path: "^/admin/.*", action: "DENY", user_agent: "" },
						]);
					}}
				>
					<IconPlus className="h-4 w-4 mr-2" />
					Add Rule
				</Button>
			</div>

			<FieldArray
				name="anubisRules"
				render={(arrayHelpers) => (
					<div className="space-y-3">
						{rules.length === 0 && (
							<p className="text-sm text-muted-foreground text-center py-4">
								No custom rules defined. Anubis will only use its baseline protection.
							</p>
						)}
						{rules.map((rule, index) => (
							// Biome ignore lint/suspicious/noArrayIndexKey: Rules don't have IDs yet, using index + path as stable-ish key for editing
							<div
								key={`${index}-${rule.path}`}
								className="flex gap-2 items-start p-2 border rounded bg-background/50"
							>
								<div className="grid grid-cols-12 gap-2 flex-1">
									<div className="col-span-4">
										<Input
											placeholder="Path Regex (e.g. ^/admin)"
											value={rule.path}
											onChange={(e) => setFieldValue(`anubisRules.${index}.path`, e.target.value)}
											className="h-8 text-xs font-mono"
										/>
									</div>
									<div className="col-span-3">
										<Select
											value={rule.action}
											onValueChange={(val) => setFieldValue(`anubisRules.${index}.action`, val)}
										>
											<SelectTrigger className="h-8 text-xs">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="ALLOW">ALLOW</SelectItem>
												<SelectItem value="DENY">DENY</SelectItem>
												<SelectItem value="CHALLENGE">CHALLENGE</SelectItem>
											</SelectContent>
										</Select>
									</div>
									<div className="col-span-5">
										<Input
											placeholder="User Agent Regex (Optional)"
											value={rule.user_agent || ""}
											onChange={(e) =>
												setFieldValue(`anubisRules.${index}.user_agent`, e.target.value)
											}
											className="h-8 text-xs font-mono"
										/>
									</div>
								</div>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="h-8 w-8 text-destructive hover:text-destructive/90"
									onClick={() => arrayHelpers.remove(index)}
								>
									<IconTrash className="h-4 w-4" />
								</Button>
							</div>
						))}
					</div>
				)}
			/>
		</div>
	);
};

export default AnubisRulesField;
