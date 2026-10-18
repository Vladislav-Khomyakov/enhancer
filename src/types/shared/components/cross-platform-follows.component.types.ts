import type WorkerService from "$shared/worker/worker.service.ts";
import type { PlatformType } from "$types/shared/platform.types.ts";
import type { FollowsLinkedPlatform } from "$types/shared/worker/channel-links-worker.types.ts";
import type {
	CrossPlatformChannel,
	FollowsSortOrder,
} from "$types/shared/worker/cross-platform-follows-worker.types.ts";

export type CrossPlatformFollowsComponentProps = {
	hostPlatform: PlatformType;
	workerService: WorkerService;
	title: string | null;
	pinsEnabled: boolean;
	sort: FollowsSortOrder;
	onSortChange: (sort: FollowsSortOrder) => void;
	linkedPlatform: FollowsLinkedPlatform;
	onNavigate: (url: string) => void;
};

export type SidebarChannel = CrossPlatformChannel & { platform: PlatformType; linked?: LinkedChannels };

export type LinkedChannels = {
	channels: Record<PlatformType, SidebarChannel>;
	primary: PlatformType | null;
};

export type ChannelLinkSuggestion = Record<PlatformType, SidebarChannel>;

export type LinkMenuOption = "default" | PlatformType | "unlink" | "link";

export type SidebarChannelRowProps = {
	channel: SidebarChannel;
	host: PlatformType;
	compact: boolean;
	now: number;
	onTogglePin?: (channel: SidebarChannel) => void;
	onLinkAction?: (channel: SidebarChannel, option: LinkMenuOption) => void;
	onPick?: (channel: SidebarChannel) => void;
	onNavigate: (url: string) => void;
	resolvePreviewUrl: (platform: PlatformType, login: string) => Promise<string | null>;
};
