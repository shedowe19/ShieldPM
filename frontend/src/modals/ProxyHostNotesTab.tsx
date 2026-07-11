import { Field, type FieldProps } from "formik";
import { Label } from "src/components/ui/label";
import { TabsContent } from "src/components/ui/tabs";
import { Textarea } from "src/components/ui/textarea";
import { intl, T } from "src/locale";
import { PROXY_HOST_TAB } from "src/types/enums";

const ProxyHostNotesTab = () => (
	<TabsContent value={PROXY_HOST_TAB.NOTES} className="mt-0 space-y-4 pt-4">
		<Field name="note">
			{({ field }: FieldProps) => (
				<div className="space-y-2 mb-4">
					<Label htmlFor="note">
						<T id="host.note" />
					</Label>
					<Textarea
						id="note"
						placeholder={intl.formatMessage({ id: "host.note.placeholder" })}
						className="min-h-[300px] font-mono text-sm"
						{...field}
					/>
					<p className="text-xs text-muted-foreground">
						<T id="host.note.hint" />
					</p>
				</div>
			)}
		</Field>
	</TabsContent>
);

export default ProxyHostNotesTab;
