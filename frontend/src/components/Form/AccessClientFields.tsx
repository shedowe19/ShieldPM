import { IconX, IconPlus } from "@tabler/icons-react";
import { useFormikContext } from "formik";
import { useState } from "react";
import type { AccessListClient } from "src/api/backend";
import { intl, T } from "src/locale";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "src/components/ui/select";
import { cn } from "src/lib/utils";

interface Props {
	initialValues: AccessListClient[];
	name?: string;
}
export function AccessClientFields({ initialValues, name = "clients" }: Props) {
	const [values, setValues] = useState<AccessListClient[]>(initialValues || []);
	const { setFieldValue } = useFormikContext();

	const blankClient: AccessListClient = { directive: "allow", address: "" };

	if (values?.length === 0) {
		setValues([blankClient]);
	}

	const handleAdd = () => {
		const newValues = [...values, blankClient];
		setValues(newValues);
		setFormField(newValues);
	};

	const handleRemove = (idx: number) => {
		const newValues = values.filter((_: AccessListClient, i: number) => i !== idx);
		if (newValues.length === 0) {
			newValues.push(blankClient);
		}
		setValues(newValues);
		setFormField(newValues);
	};

	const handleChange = (idx: number, field: string, fieldValue: string) => {
		const newValues = values.map((v: AccessListClient, i: number) =>
			i === idx ? { ...v, [field]: fieldValue } : v,
		);
		setValues(newValues);
		setFormField(newValues);
	};

	const setFormField = (newValues: AccessListClient[]) => {
		const filtered = newValues.filter((v: AccessListClient) => v?.address?.trim() !== "");
		setFieldValue(name, filtered);
	};

	return (
		<div className="space-y-4">
			<p className="text-sm text-muted-foreground">
				<T id="access-list.help.rules-order" />
			</p>
			{values.map((client: AccessListClient, idx: number) => (
				<div className="flex items-center gap-2" key={idx}>
					<div className="flex-1 flex gap-2">
						<div className="w-32 flex-shrink-0">
							<Select
								value={client.directive}
								onValueChange={(val) => handleChange(idx, "directive", val)}
							>
								<SelectTrigger className={cn(
									client.directive === "allow" ? "bg-green-100 dark:bg-green-900 border-green-200 dark:border-green-800 text-green-800 dark:text-green-100" : "bg-orange-100 dark:bg-orange-900 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-100"
								)}>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="allow">
										<T id="action.allow" />
									</SelectItem>
									<SelectItem value="deny">
										<T id="action.deny" />
									</SelectItem>
								</SelectContent>
							</Select>
						</div>
						<Input
							name={`clients[${idx}].address`}
							type="text"
							autoComplete="off"
							value={client.address}
							onChange={(e) => handleChange(idx, "address", e.target.value)}
							placeholder={intl.formatMessage({ id: "access-list.rule-source.placeholder" })}
							className="flex-1"
						/>
					</div>
					<Button
						type="button"
						variant="destructive"
						size="icon"
						onClick={() => handleRemove(idx)}
						title={intl.formatMessage({ id: "action.delete" })}
					>
						<IconX size={16} />
					</Button>
				</div>
			))}
			<div className="mb-3">
				<Button type="button" variant="secondary" size="sm" onClick={handleAdd}>
					<IconPlus className="mr-2 h-4 w-4" />
					<T id="action.add" />
				</Button>
			</div>

			<div className="border-t pt-4">
				<p className="text-sm text-muted-foreground mb-2">
					<T id="access-list.help-rules-last" />
				</p>
				<div className="flex items-center gap-2 opacity-60">
					<div className="flex-1 flex gap-2">
						<div className="w-32 flex-shrink-0">
							<Select value="deny" disabled>
								<SelectTrigger className="bg-orange-100 dark:bg-orange-900 border-orange-200 dark:border-orange-800 text-orange-800 dark:text-orange-100">
									<SelectValue>
										<T id="action.deny" />
									</SelectValue>
								</SelectTrigger>
							</Select>
						</div>
						<Input
							value="all"
							disabled
							readOnly
							className="flex-1"
						/>
					</div>
					<div className="w-10" /> {/* Spacer to match delete button width */}
				</div>
			</div>
		</div>
	);
}
