import { Avatar, AvatarFallback, AvatarImage } from "src/components/ui/avatar";

const defaultImg = "/images/default-avatar.jpg";

interface Props {
	url?: string;
	name?: string;
}
export function UserAvatar({ url, name }: Props) {
	return (
		<div className="flex items-center py-1">
			<Avatar className="h-8 w-8 mr-2">
				<AvatarImage src={url || defaultImg} alt={name} />
				<AvatarFallback className="uppercase">{name?.charAt(0)}</AvatarFallback>
			</Avatar>
		</div>
	);
}
