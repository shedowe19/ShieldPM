import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { Loading } from "src/components/Loading";
import { Alert, AlertDescription } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { T } from "src/locale";
import { showObjectSuccess } from "src/notifications";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";

interface Props<T extends object> {
	title: string;
	query: UseQueryResult<T, Error>;
	mutation: UseMutationResult<T, Error, T>;
	valid: (values: T) => boolean;
	children: (values: T, change: (patch: Partial<T>) => void, pending: boolean) => ReactNode;
}

export default function OptionsCard<T extends object>({ title, query, mutation, valid, children }: Props<T>) {
	const [draft, setDraft] = useState<T>();
	const values = draft ?? query.data;
	const changed =
		query.data &&
		values &&
		Object.keys(query.data).some((key) => values[key as keyof T] !== query.data?.[key as keyof T]);
	const canSave = changed && values && valid(values) && !mutation.isPending;
	const save = async () => {
		if (!canSave || !values) return;
		try {
			await mutation.mutateAsync(values);
			setDraft(undefined);
			showObjectSuccess(AUDIT_LOG_OBJECT_TYPE.SETTING, "saved");
		} catch {
			// Keep the draft and expose the API error below.
		}
	};
	return (
		<Card>
			<CardHeader>
				<CardTitle>
					<T id={title} />
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				{query.isPending && <Loading noLogo />}
				{(mutation.error || query.error) && (
					<Alert variant="destructive">
						<AlertDescription>{(mutation.error || query.error)?.message}</AlertDescription>
					</Alert>
				)}
				{values && (
					<>
						{children(
							values,
							(patch) => {
								mutation.reset();
								setDraft({ ...values, ...patch });
							},
							mutation.isPending,
						)}
						<div className="flex justify-end">
							<Button type="button" disabled={!canSave} onClick={save}>
								<T id="save" />
							</Button>
						</div>
					</>
				)}
			</CardContent>
		</Card>
	);
}
