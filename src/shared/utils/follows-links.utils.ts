import type {
	ChannelLinkSuggestion,
	SidebarChannel,
} from "$types/shared/components/cross-platform-follows.component.types.ts";
import type { PlatformType } from "$types/shared/platform.types.ts";
import type {
	ChannelLink,
	ChannelLinkRecord,
	FollowsLinkedPlatform,
} from "$types/shared/worker/channel-links-worker.types.ts";
import type { CrossPlatformChannel } from "$types/shared/worker/cross-platform-follows-worker.types.ts";

export const FOLLOWS_LINKED_PLATFORM_LABELS: Record<FollowsLinkedPlatform, string> = {
	live: "Where they're live (default)",
	twitch: "Twitch",
	kick: "Kick",
};

export const FOLLOWS_LINKED_PLATFORMS = Object.keys(FOLLOWS_LINKED_PLATFORM_LABELS) as FollowsLinkedPlatform[];

export function getChannelLinkId(twitch: string, kick: string): string {
	return `${twitch}:${kick}`;
}

export function getConflictingLinkIds(links: ChannelLinkRecord[], record: ChannelLinkRecord): string[] {
	if (record.dismissed) return [];
	return links
		.filter(
			(link) =>
				link.id !== record.id && !link.dismissed && (link.twitch === record.twitch || link.kick === record.kick),
		)
		.map((link) => link.id);
}

export function pickLinkedPlatform(
	channels: Record<PlatformType, CrossPlatformChannel>,
	primary: PlatformType | null,
	preference: FollowsLinkedPlatform,
	host: PlatformType,
): PlatformType {
	const { twitch, kick } = channels;
	if (twitch.live !== kick.live) return twitch.live ? "twitch" : "kick";
	const chosen = primary ?? (preference === "live" ? null : preference);
	if (chosen) return chosen;
	const difference = twitch.live ? twitch.viewers - kick.viewers : (twitch.lastLiveAt ?? 0) - (kick.lastLiveAt ?? 0);
	if (difference === 0) return host;
	return difference > 0 ? "twitch" : "kick";
}

function latest(a: number | null, b: number | null): number | null {
	if (a === null) return b;
	return b === null ? a : Math.max(a, b);
}

function mergeLink(
	channels: Record<PlatformType, SidebarChannel>,
	primary: PlatformType | null,
	preference: FollowsLinkedPlatform,
	host: PlatformType,
): SidebarChannel {
	const { twitch, kick } = channels;
	const shown = channels[pickLinkedPlatform(channels, primary, preference, host)];
	return {
		...shown,
		live: twitch.live || kick.live,
		viewers: (twitch.live ? twitch.viewers : 0) + (kick.live ? kick.viewers : 0),
		pinned: twitch.pinned || kick.pinned,
		watchtime: twitch.watchtime + kick.watchtime,
		watchedAt: latest(twitch.watchedAt, kick.watchedAt),
		lastLiveAt: latest(twitch.lastLiveAt, kick.lastLiveAt),
		linked: { channels, primary },
	};
}

export function mergeLinkedChannels(
	channels: SidebarChannel[],
	links: ChannelLink[],
	preference: FollowsLinkedPlatform,
	host: PlatformType,
): SidebarChannel[] {
	const byKey = new Map(channels.map((channel) => [`${channel.platform}:${channel.login}`, channel]));
	const merged = new Map<string, SidebarChannel>();
	const consumed = new Set<string>();

	for (const link of links) {
		if (link.dismissed) continue;
		const twitchKey = `twitch:${link.twitch}`;
		const kickKey = `kick:${link.kick}`;
		const twitch = byKey.get(twitchKey);
		const kick = byKey.get(kickKey);
		if (!twitch || !kick || consumed.has(twitchKey) || consumed.has(kickKey)) continue;
		consumed.add(twitchKey).add(kickKey);
		merged.set(twitchKey, mergeLink({ twitch, kick }, link.primary, preference, host));
	}

	const result: SidebarChannel[] = [];
	for (const channel of channels) {
		const key = `${channel.platform}:${channel.login}`;
		const entry = merged.get(key);
		if (entry) result.push(entry);
		else if (!consumed.has(key)) result.push(channel);
	}
	return result;
}

export function findLinkSuggestions(channels: SidebarChannel[], links: ChannelLink[]): ChannelLinkSuggestion[] {
	const linked = new Set(
		links.filter((link) => !link.dismissed).flatMap((link) => [`twitch:${link.twitch}`, `kick:${link.kick}`]),
	);
	const dismissed = new Set(
		links.filter((link) => link.dismissed).map((link) => getChannelLinkId(link.twitch, link.kick)),
	);
	const twitchChannels = new Map(
		channels.filter((channel) => channel.platform === "twitch").map((channel) => [channel.login, channel]),
	);

	const suggestions: ChannelLinkSuggestion[] = [];
	for (const kick of channels) {
		if (kick.platform !== "kick") continue;
		const twitch = twitchChannels.get(kick.login);
		if (!twitch || linked.has(`twitch:${twitch.login}`) || linked.has(`kick:${kick.login}`)) continue;
		if (dismissed.has(getChannelLinkId(twitch.login, kick.login))) continue;
		suggestions.push({ twitch, kick });
	}
	return suggestions;
}

export function matchesFollowsPlatform(channel: SidebarChannel, platform: PlatformType): boolean {
	if (!channel.linked) return channel.platform === platform;
	return !channel.live || channel.linked.channels[platform].live;
}

export function getFollowEntryKey(channel: SidebarChannel): string {
	if (!channel.linked) return `${channel.platform}:${channel.login}`;
	const { twitch, kick } = channel.linked.channels;
	return `linked:${twitch.login}:${kick.login}`;
}
