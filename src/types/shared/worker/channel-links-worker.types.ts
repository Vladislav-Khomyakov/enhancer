import type { PlatformType } from "$types/shared/platform.types.ts";

export type FollowsLinkedPlatform = "live" | "twitch" | "kick";

export type ChannelLink = {
	twitch: string;
	kick: string;
	primary: PlatformType | null;
	dismissed: boolean;
};

export type ChannelLinkRecord = ChannelLink & {
	id: string;
	updatedAt: number;
};

export interface UpdateChannelLinkPayload {
	twitch: string;
	kick: string;
	primary: PlatformType | null;
	dismissed: boolean;
}

export interface ChannelLinksPayload {
	links: ChannelLink[];
}
