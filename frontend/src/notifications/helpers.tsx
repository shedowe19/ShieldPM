import { AlertCircle, Check } from "lucide-react";
import { toast } from "src/hooks/use-toast";
import { intl } from "src/locale";

const showSuccess = (message: string) => {
	toast({
		className: "border-l-4 border-l-green-500",
		title: (
			<div className="flex items-center gap-2">
				<Check className="h-4 w-4 text-green-500" />
				<span>{intl.formatMessage({ id: "notification.success" })}</span>
			</div>
		) as any, // Cast to any to avoid type conflict if strict ReactNode check fails
		description: message,
	});
};

const showError = (message: string) => {
	toast({
		variant: "destructive",
		title: (
			<div className="flex items-center gap-2">
				<AlertCircle className="h-4 w-4" />
				<span>{intl.formatMessage({ id: "notification.error" })}</span>
			</div>
		) as any,
		description: message,
	});
};

const showObjectSuccess = (obj: string, action: string) => {
	showSuccess(
		intl.formatMessage(
			{
				id: `notification.object-${action}`,
			},
			{ object: intl.formatMessage({ id: obj }) },
		),
	);
};

export { showSuccess, showError, showObjectSuccess };
