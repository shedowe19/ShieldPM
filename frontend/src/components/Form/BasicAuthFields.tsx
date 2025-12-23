import { IconX, IconPlus } from "@tabler/icons-react";
import { useFormikContext } from "formik";
import { useState } from "react";
import type { AccessListItem } from "src/api/backend";
import { T } from "src/locale";
import { Button } from "src/components/ui/button";
import { Input } from "src/components/ui/input";
import { Label } from "src/components/ui/label";

interface Props {
	initialValues: AccessListItem[];
	name?: string;
}
export function BasicAuthFields({ initialValues, name = "items" }: Props) {
	const [values, setValues] = useState<AccessListItem[]>(initialValues || []);
	const { setFieldValue } = useFormikContext();

	const blankItem: AccessListItem = { username: "", password: "" };

	if (values?.length === 0) {
		setValues([blankItem]);
	}

	const handleAdd = () => {
		setValues([...values, blankItem]);
	};

	const handleRemove = (idx: number) => {
		const newValues = values.filter((_: AccessListItem, i: number) => i !== idx);
		if (newValues.length === 0) {
			newValues.push(blankItem);
		}
		setValues(newValues);
		setFormField(newValues);
	};

	const handleChange = (idx: number, field: string, fieldValue: string) => {
		const newValues = values.map((v: AccessListItem, i: number) => (i === idx ? { ...v, [field]: fieldValue } : v));
		setValues(newValues);
		setFormField(newValues);
	};

	const setFormField = (newValues: AccessListItem[]) => {
		const filtered = newValues.filter((v: AccessListItem) => v?.username?.trim() !== "");
		setFieldValue(name, filtered);
	};

	return (
		<div className="space-y-4">
			<div className="grid grid-cols-12 gap-2 mb-2">
				<div className="col-span-6">
					<Label><T id="username" /></Label>
				</div>
				<div className="col-span-5">
					<Label><T id="password" /></Label>
				</div>
			</div>
			{values.map((item: AccessListItem, idx: number) => (
				<div className="grid grid-cols-12 gap-2 items-center" key={idx}>
					<div className="col-span-6">
						<Input
							type="text"
							autoComplete="off"
							value={item.username}
							onChange={(e) => handleChange(idx, "username", e.target.value)}
						/>
					</div>
					<div className="col-span-5">
						<Input
							type="password"
							autoComplete="off"
							value={item.password}
							placeholder={
								initialValues.filter((iv: AccessListItem) => iv.username === item.username).length > 0
									? "••••••••"
									: ""
							}
							onChange={(e) => handleChange(idx, "password", e.target.value)}
						/>
					</div>
					<div className="col-span-1 text-right">
						<Button
							type="button"
							variant="destructive"
							size="icon"
							onClick={() => handleRemove(idx)}
						>
							<IconX size={16} />
						</Button>
					</div>
				</div>
			))}
			<div>
				<Button type="button" variant="secondary" size="sm" onClick={handleAdd}>
					<IconPlus className="mr-2 h-4 w-4" />
					<T id="action.add" />
				</Button>
			</div>
		</div>
	);
}
