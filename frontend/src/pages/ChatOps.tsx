import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import {
	createChatIntegration,
	deleteChatIntegration,
	getChatIntegrations,
	updateChatIntegration,
} from "@/api/backend";
import type { ChatIntegration } from "@/api/backend/models";
import { SiteContainer as Container } from "@/components/SiteContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { CHAT_PROVIDER } from "@/types/enums";

const formSchema = z.object({
	token: z.string().min(1, "Token is required"),
	allowed_ids: z.string().min(1, "At least one ID is required"),
	enabled: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

export default function ChatOps() {
	const { t } = useTranslation();
	const { toast } = useToast();
	const queryClient = useQueryClient();

	const { data: integrations, isLoading } = useQuery({
		queryKey: ["chat-integrations"],
		queryFn: getChatIntegrations,
	});

	// For this MVP, we assume one integration per user (Telegram)
	const existing = integrations?.[0];

	const form = useForm<FormValues>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			token: "",
			allowed_ids: "",
			enabled: true,
		},
	});

	useEffect(() => {
		if (existing) {
			form.reset({
				token: "********", // Don't show real encrypted token
				allowed_ids: existing.config?.allowed_ids?.join(", ") || "",
				enabled: existing.enabled,
			});
		}
	}, [existing, form]);

	const createMutation = useMutation({
		mutationFn: createChatIntegration,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["chat-integrations"] });
			toast({ title: t("saved") });
		},
		onError: (err) => {
			toast({ title: t("error"), description: err.message, variant: "destructive" });
		},
	});

	const updateMutation = useMutation({
		mutationFn: (data: Partial<ChatIntegration>) => {
			if (!existing) throw new Error("No existing integration");
			return updateChatIntegration(existing.id, data);
		},
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["chat-integrations"] });
			toast({ title: t("saved") });
		},
		onError: (err) => {
			toast({ title: t("error"), description: err.message, variant: "destructive" });
		},
	});

	const deleteMutation = useMutation({
		mutationFn: deleteChatIntegration,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ["chat-integrations"] });
			form.reset({ token: "", allowed_ids: "", enabled: true });
			toast({ title: t("deleted") });
		},
	});

	const onSubmit = (values: FormValues) => {
		const payload = {
			provider: CHAT_PROVIDER.TELEGRAM,
			token: values.token === "********" ? undefined : values.token, // Don't send masked token
			enabled: values.enabled,
			config: {
				allowed_ids: values.allowed_ids.split(",").map((s) => s.trim()),
			},
		};

		if (existing) {
			updateMutation.mutate(payload);
		} else {
			createMutation.mutate(payload);
		}
	};

	if (isLoading) return <Loader2 className="animate-spin" />;

	return (
		<Container>
			<div className="mb-6">
				<h1 className="text-3xl font-bold tracking-tight">ChatOps</h1>
				<p className="text-muted-foreground">{t("chatops_description") || "Manage Chat Integrations"}</p>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Telegram Bot</CardTitle>
					<CardDescription>Configure a Telegram Bot to manage your server via chat.</CardDescription>
				</CardHeader>
				<CardContent>
					<Form {...form}>
						<form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
							<FormField
								control={form.control}
								name="token"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Bot Token</FormLabel>
										<FormControl>
											<Input placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" {...field} />
										</FormControl>
										<FormDescription>Create a bot via @BotFather on Telegram.</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="allowed_ids"
								render={({ field }) => (
									<FormItem>
										<FormLabel>Allowed User IDs</FormLabel>
										<FormControl>
											<Input placeholder="12345678, 87654321" {...field} />
										</FormControl>
										<FormDescription>
											Comma-separated list of Telegram User IDs allowed to interact with this bot.
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>

							<FormField
								control={form.control}
								name="enabled"
								render={({ field }) => (
									<FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
										<div className="space-y-0.5">
											<FormLabel className="text-base">Enabled</FormLabel>
											<FormDescription>Enable or disable this bot integration.</FormDescription>
										</div>
										<FormControl>
											<Switch checked={field.value} onCheckedChange={field.onChange} />
										</FormControl>
									</FormItem>
								)}
							/>

							<div className="flex justify-between">
								<Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
									{(createMutation.isPending || updateMutation.isPending) && (
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
									)}
									{t("save")}
								</Button>

								{existing && (
									<Button
										type="button"
										variant="destructive"
										onClick={() => deleteMutation.mutate(existing.id)}
										disabled={deleteMutation.isPending}
									>
										<Trash2 className="mr-2 h-4 w-4" />
										{t("delete")}
									</Button>
								)}
							</div>
						</form>
					</Form>
				</CardContent>
			</Card>
		</Container>
	);
}
