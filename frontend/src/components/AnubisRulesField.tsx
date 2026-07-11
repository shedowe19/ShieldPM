import { IconChevronDown, IconChevronUp, IconPlus, IconTrash } from "@tabler/icons-react";
import { FieldArray, useFormikContext } from "formik";
import { useState } from "react";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { intl } from "src/locale";

interface AnubisRule {
	name?: string;
	path?: string;
	action: "ALLOW" | "DENY" | "CHALLENGE";
	userAgent?: string;
	remoteAddresses?: string[];
	challengeDifficulty?: number | null;
	challengeAlgorithm?: "fast" | "slow" | "metarefresh" | "preact";
}

const AnubisRulesField = () => {
	const { values, setFieldValue } = useFormikContext<{ anubisRules: AnubisRule[] }>();
	const rules = values.anubisRules || [];
	const [expandedRules, setExpandedRules] = useState<Record<number, boolean>>({});

	const toggleExpand = (index: number) => {
		setExpandedRules((prev) => ({ ...prev, [index]: !prev[index] }));
	};

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
							{
								name: "",
								path: ".*",
								action: "CHALLENGE",
								userAgent: "",
								remoteAddresses: [],
								challengeDifficulty: null,
								challengeAlgorithm: undefined,
							},
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
							<div
								key={`${index}-${rule.path}`}
								className="border rounded bg-background/50 overflow-hidden"
							>
								{/* Main Row */}
								<div className="flex gap-2 items-center p-2">
									<div className="grid grid-cols-12 gap-2 flex-1">
										<div className="col-span-3">
											<Input
												placeholder="Rule Name (optional)"
												value={rule.name || ""}
												onChange={(e) =>
													setFieldValue(`anubisRules.${index}.name`, e.target.value)
												}
												className="h-8 text-xs font-mono"
											/>
										</div>
										<div className="col-span-3">
											<Input
												placeholder="Path Regex (e.g. .*)"
												value={rule.path || ""}
												onChange={(e) =>
													setFieldValue(`anubisRules.${index}.path`, e.target.value)
												}
												className="h-8 text-xs font-mono"
											/>
										</div>
										<div className="col-span-2">
											<Select
												value={rule.action}
												onValueChange={(val) =>
													setFieldValue(`anubisRules.${index}.action`, val)
												}
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
										<div className="col-span-4">
											<Input
												placeholder="User Agent Regex (Optional)"
												value={rule.userAgent || ""}
												onChange={(e) =>
													setFieldValue(`anubisRules.${index}.userAgent`, e.target.value)
												}
												className="h-8 text-xs font-mono"
											/>
										</div>
									</div>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-8 w-8 text-muted-foreground hover:text-foreground"
										aria-label={intl.formatMessage({ id: "action.advanced-settings" })}
										aria-expanded={Boolean(expandedRules[index])}
										onClick={() => toggleExpand(index)}
									>
										{expandedRules[index] ? (
											<IconChevronUp className="h-4 w-4" />
										) : (
											<IconChevronDown className="h-4 w-4" />
										)}
									</Button>
									<Button
										type="button"
										variant="ghost"
										size="icon"
										className="h-8 w-8 text-destructive hover:text-destructive/90"
										aria-label={intl.formatMessage({ id: "action.delete" })}
										onClick={() => arrayHelpers.remove(index)}
									>
										<IconTrash className="h-4 w-4" />
									</Button>
								</div>

								{/* Expanded Settings */}
								{expandedRules[index] && (
									<div className="px-3 pb-3 pt-1 border-t border-dashed space-y-3">
										{/* Remote Addresses */}
										<div className="space-y-1">
											<Label className="text-xs text-muted-foreground">
												Remote Addresses (CIDR, comma-separated)
											</Label>
											<Input
												placeholder="e.g. 192.168.1.0/24, 10.0.0.0/8"
												value={(rule.remoteAddresses || []).join(", ")}
												onChange={(e) => {
													const addresses = e.target.value
														.split(",")
														.map((s) => s.trim())
														.filter((s) => s.length > 0);
													setFieldValue(`anubisRules.${index}.remoteAddresses`, addresses);
												}}
												className="h-8 text-xs font-mono"
											/>
										</div>

										{/* Challenge Settings - only for CHALLENGE action */}
										{rule.action === "CHALLENGE" && (
											<div className="grid grid-cols-2 gap-3">
												<div className="space-y-1">
													<Label className="text-xs text-muted-foreground">
														Challenge Difficulty (1-16)
													</Label>
													<Input
														type="number"
														min={1}
														max={16}
														placeholder="Default: 4"
														value={rule.challengeDifficulty ?? ""}
														onChange={(e) =>
															setFieldValue(
																`anubisRules.${index}.challengeDifficulty`,
																e.target.value
																	? Number.parseInt(e.target.value, 10)
																	: null,
															)
														}
														className="h-8 text-xs"
													/>
												</div>
												<div className="space-y-1">
													<Label className="text-xs text-muted-foreground">
														Challenge Algorithm
													</Label>
													<Select
														value={rule.challengeAlgorithm || ""}
														onValueChange={(val) =>
															setFieldValue(
																`anubisRules.${index}.challengeAlgorithm`,
																val || undefined,
															)
														}
													>
														<SelectTrigger className="h-8 text-xs">
															<SelectValue placeholder="Default (fast)" />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="fast">Fast (PoW)</SelectItem>
															<SelectItem value="slow">Slow (Waste CPU)</SelectItem>
															<SelectItem value="metarefresh">Meta Refresh</SelectItem>
															<SelectItem value="preact">Preact (JS)</SelectItem>
														</SelectContent>
													</Select>
												</div>
											</div>
										)}
									</div>
								)}
							</div>
						))}
					</div>
				)}
			/>
		</div>
	);
};

export default AnubisRulesField;
