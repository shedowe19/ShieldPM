import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useCloudflaredTunnel } from "@/hooks/useCloudflaredTunnel";
import type { CloudflaredTunnel } from "@/api/backend";

const formSchema = z.object({
	name: z.string().min(1, "Name is required"),
	token: z.string().min(1, "Token is required"),
});

interface CloudflaredTunnelModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	tunnel?: CloudflaredTunnel | null;
}

export function CloudflaredTunnelModal({ open, onOpenChange, tunnel }: CloudflaredTunnelModalProps) {
	const { t } = useTranslation();
	const { create, update } = useCloudflaredTunnel();

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			token: "",
		},
	});

	useEffect(() => {
		if (open) {
			form.reset({
				name: tunnel?.name || "",
				token: tunnel?.token || "",
			});
		}
	}, [open, tunnel, form]);

	const onSubmit = (values: z.infer<typeof formSchema>) => {
		if (tunnel) {
			update.mutate(
				{ id: tunnel.id, data: values },
				{
					onSuccess: () => onOpenChange(false),
				},
			);
		} else {
			create.mutate(values, {
				onSuccess: () => onOpenChange(false),
			});
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle>{tunnel ? t("cloudflared.edit") : t("cloudflared.add")}</DialogTitle>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
						<FormField
							control={form.control}
							name="name"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("name")}</FormLabel>
									<FormControl>
										<Input placeholder="My Tunnel" {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<FormField
							control={form.control}
							name="token"
							render={({ field }) => (
								<FormItem>
									<FormLabel>{t("cloudflared.token")}</FormLabel>
									<FormControl>
										<Input type="password" placeholder="eyJhIjoi..." {...field} />
									</FormControl>
									<FormMessage />
								</FormItem>
							)}
						/>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
								{t("cancel")}
							</Button>
							<Button type="submit" disabled={create.isPending || update.isPending}>
								{t("save")}
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
