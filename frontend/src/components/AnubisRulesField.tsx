import { IconChevronDown, IconChevronUp, IconPlus, IconTrash } from "@tabler/icons-react";
import { FieldArray, useFormikContext } from "formik";
import { useState } from "react";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { intl, T } from "src/locale";

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
				<h4 className="text-sm font-medium">
					<T id="anubis.rules.title" />
				</h4>
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
					<T id="anubis.rules.add" />
				</Button>
			</div>

			<FieldArray
				name="anubisRules"
				render={(arrayHelpers) => (
					<div className="space-y-3">
						{rules.length === 0 && (
							<p className="text-sm text-muted-foreground text-center py-4">
								<T id="anubis.rules.empty" />
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
												placeholder={intl.formatMessage({
													id: "anubis.rules.name.placeholder",
												})}
												value={rule.name || ""}
												onChange={(e) =>
													setFieldValue(`anubisRules.${index}.name`, e.target.value)
												}
												className="h-8 text-xs font-mono"
											/>
										</div>
										<div className="col-span-3">
											<Input
												placeholder={intl.formatMessage({
													id: "anubis.rules.path.placeholder",
												})}
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
													<SelectItem value="ALLOW">
														<T id="action.allow" />
													</SelectItem>
													<SelectItem value="DENY">
														<T id="action.deny" />
													</SelectItem>
													<SelectItem value="CHALLENGE">
														<T id="anubis.rules.action.challenge" />
													</SelectItem>
												</SelectContent>
											</Select>
										</div>
										<div className="col-span-4">
											<Input
												placeholder={intl.formatMessage({
													id: "anubis.rules.user-agent.placeholder",
												})}
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
												<T id="anubis.rules.remote-addresses" />
											</Label>
											<Input
												placeholder={intl.formatMessage({
													id: "anubis.rules.remote-addresses.placeholder",
												})}
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
														<T id="anubis.rules.challenge-difficulty" />
													</Label>
													<Input
														type="number"
														min={1}
														max={16}
														placeholder={intl.formatMessage({
															id: "anubis.rules.challenge-difficulty.placeholder",
														})}
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
														<T id="anubis.rules.challenge-algorithm" />
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
															<SelectValue
																placeholder={intl.formatMessage({
																	id: "anubis.rules.algorithm.placeholder",
																})}
															/>
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="fast">
																<T id="anubis.rules.algorithm.fast" />
															</SelectItem>
															<SelectItem value="slow">
																<T id="anubis.rules.algorithm.slow" />
															</SelectItem>
															<SelectItem value="metarefresh">
																<T id="anubis.rules.algorithm.meta-refresh" />
															</SelectItem>
															<SelectItem value="preact">
																<T id="anubis.rules.algorithm.preact" />
															</SelectItem>
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
