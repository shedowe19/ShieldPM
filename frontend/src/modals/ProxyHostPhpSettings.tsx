import { Field, type FieldProps } from "formik";
import { Card, CardContent } from "src/components/ui/card";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Switch } from "src/components/ui/switch";
import { Textarea } from "src/components/ui/textarea";
import { intl, T } from "src/locale";
import { FORWARD_SCHEME, PHP_VERSION } from "src/types/enums";

const ProxyHostPhpSettings = () => (
	<Field name="forwardScheme">
		{({ field: schemeField }: FieldProps) =>
			schemeField.value === FORWARD_SCHEME.PATH && (
				<Card className="my-3 border-dashed border-purple-500/50">
					<CardContent className="p-4">
						<h4 className="pb-2 text-lg font-semibold text-purple-400">
							<T id="proxy-host.php-settings" />
						</h4>
						<p className="text-sm text-muted-foreground mb-4">
							<T id="proxy-host.php-settings.hint" />
						</p>
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<Label htmlFor="phpEnabled" className="flex-1 cursor-pointer">
									<T id="proxy-host.php-enabled" />
								</Label>
								<Field name="phpEnabled" type="checkbox">
									{({ field, form }: FieldProps) => (
										<Switch
											id="phpEnabled"
											checked={field.checked}
											onCheckedChange={(checked: boolean) =>
												form.setFieldValue("phpEnabled", checked)
											}
										/>
									)}
								</Field>
							</div>

							<Field name="phpEnabled" type="checkbox">
								{({ field: phpField }: FieldProps) =>
									phpField.checked && (
										<>
											<Field name="phpVersion">
												{({ field, form }: FieldProps) => (
													<div className="space-y-2">
														<Label htmlFor="phpVersion">
															<T id="proxy-host.php-version" />
														</Label>
														<Select
															onValueChange={(value: string) =>
																form.setFieldValue(field.name, value)
															}
															value={field.value}
														>
															<SelectTrigger id="phpVersion">
																<SelectValue placeholder="PHP 8.3" />
															</SelectTrigger>
															<SelectContent>
																<SelectItem value={PHP_VERSION.PHP82}>
																	PHP 8.2
																</SelectItem>
																<SelectItem value={PHP_VERSION.PHP83}>
																	PHP 8.3
																</SelectItem>
																<SelectItem value={PHP_VERSION.PHP84}>
																	PHP 8.4
																</SelectItem>
															</SelectContent>
														</Select>
													</div>
												)}
											</Field>

											<Field name="php_override_ini">
												{({ field }: FieldProps) => (
													<div className="space-y-2 pt-2">
														<Label htmlFor="php_override_ini">
															<T id="proxy-host.php.custom-ini" />
														</Label>
														<Textarea
															id="php_override_ini"
															placeholder={intl.formatMessage({
																id: "proxy-host.php.custom-ini.placeholder",
															})}
															className="font-mono text-xs min-h-[100px]"
															{...field}
															value={field.value || ""}
														/>
														<p className="text-xs text-muted-foreground">
															<T id="proxy-host.php.custom-ini.hint" />
														</p>
													</div>
												)}
											</Field>
										</>
									)
								}
							</Field>
						</div>
					</CardContent>
				</Card>
			)
		}
	</Field>
);

export default ProxyHostPhpSettings;
