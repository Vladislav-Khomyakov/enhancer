import { expect, test } from "bun:test";
import { getFollowsComparator } from "$shared/components/cross-platform-follows/platform.shared.tsx";
import {
	findLinkSuggestions,
	getChannelLinkId,
	getConflictingLinkIds,
	matchesFollowsPlatform,
	mergeLinkedChannels,
	pickLinkedPlatform,
} from "$shared/utils/follows-links.utils.ts";
import type { SidebarChannel } from "$types/shared/components/cross-platform-follows.component.types.ts";
import type { PlatformType } from "$types/shared/platform.types.ts";
import type { ChannelLink, ChannelLinkRecord } from "$types/shared/worker/channel-links-worker.types.ts";

const NOW = 1_000_000_000;

function channel(platform: PlatformType, login: string, changes: Partial<SidebarChannel> = {}): SidebarChannel {
	return {
		platform,
		login,
		displayName: login,
		avatarUrl: null,
		live: false,
		viewers: 0,
		title: null,
		category: null,
		thumbnailUrl: null,
		startedAt: null,
		lastLiveAt: null,
		checked: true,
		pinned: false,
		watchtime: 0,
		watchedAt: null,
		...changes,
	};
}

function link(twitch: string, kick: string, changes: Partial<ChannelLink> = {}): ChannelLink {
	return { twitch, kick, primary: null, dismissed: false, ...changes };
}

function record(twitch: string, kick: string, changes: Partial<ChannelLink> = {}): ChannelLinkRecord {
	return { ...link(twitch, kick, changes), id: getChannelLinkId(twitch, kick), updatedAt: 0 };
}

const keys = (channels: SidebarChannel[]) => channels.map((item) => `${item.platform}:${item.login}`);

test("shows the platform where the streamer is live when only one is live", () => {
	const twitch = channel("twitch", "xqc");
	const kick = channel("kick", "xqc", { live: true, viewers: 10 });

	expect(pickLinkedPlatform({ twitch, kick }, "twitch", "twitch", "twitch")).toBe("kick");
});

test("uses the channel's choice, then the default, when live on both or neither", () => {
	const twitch = channel("twitch", "xqc", { live: true, viewers: 50 });
	const kick = channel("kick", "xqc", { live: true, viewers: 10 });

	expect(pickLinkedPlatform({ twitch, kick }, "kick", "twitch", "twitch")).toBe("kick");
	expect(pickLinkedPlatform({ twitch, kick }, null, "kick", "twitch")).toBe("kick");
	expect(
		pickLinkedPlatform({ twitch: channel("twitch", "a"), kick: channel("kick", "a") }, null, "kick", "twitch"),
	).toBe("kick");
});

test("the live default picks more viewers, then the most recent stream, then the current site", () => {
	const bothLive = {
		twitch: channel("twitch", "a", { live: true, viewers: 5 }),
		kick: channel("kick", "a", { live: true, viewers: 9 }),
	};
	const bothOffline = {
		twitch: channel("twitch", "a", { lastLiveAt: NOW }),
		kick: channel("kick", "a", { lastLiveAt: NOW - 1 }),
	};
	const tie = { twitch: channel("twitch", "a"), kick: channel("kick", "a") };

	expect(pickLinkedPlatform(bothLive, null, "live", "twitch")).toBe("kick");
	expect(pickLinkedPlatform(bothOffline, null, "live", "kick")).toBe("twitch");
	expect(pickLinkedPlatform(tie, null, "live", "kick")).toBe("kick");
});

test("merges a linked pair into one entry that links to the chosen platform", () => {
	const channels = [
		channel("twitch", "xqc", { watchtime: 100, watchedAt: NOW - 5, lastLiveAt: NOW - 10 }),
		channel("twitch", "other"),
		channel("kick", "xqc_kick", { live: true, viewers: 30, pinned: true, watchtime: 50, watchedAt: NOW }),
	];

	const merged = mergeLinkedChannels(channels, [link("xqc", "xqc_kick")], "twitch", "twitch");

	expect(keys(merged)).toEqual(["kick:xqc_kick", "twitch:other"]);
	expect(merged[0]).toMatchObject({ live: true, viewers: 30, pinned: true, watchtime: 150, watchedAt: NOW });
	expect(merged[0].linked?.channels.twitch.login).toBe("xqc");
});

test("adds up viewers when live on both platforms", () => {
	const channels = [
		channel("twitch", "a", { live: true, viewers: 100 }),
		channel("kick", "a", { live: true, viewers: 40 }),
	];

	const [entry] = mergeLinkedChannels(channels, [link("a", "a", { primary: "kick" })], "live", "twitch");

	expect(entry).toMatchObject({ platform: "kick", viewers: 140 });
});

test("ignores dismissed links and links to channels that are no longer followed", () => {
	const channels = [channel("twitch", "a"), channel("kick", "a"), channel("kick", "b")];

	const merged = mergeLinkedChannels(
		channels,
		[link("a", "a", { dismissed: true }), link("gone", "b")],
		"live",
		"twitch",
	);

	expect(keys(merged)).toEqual(["twitch:a", "kick:a", "kick:b"]);
});

test("sorts a linked streamer by its combined live status and viewers", () => {
	const channels = [
		channel("twitch", "small", { live: true, viewers: 120 }),
		channel("twitch", "multi", { live: true, viewers: 80 }),
		channel("kick", "multi", { live: true, viewers: 60 }),
		channel("kick", "offline", { lastLiveAt: NOW }),
	];

	const merged = mergeLinkedChannels(channels, [link("multi", "multi")], "live", "kick");
	const sorted = [...merged].sort(getFollowsComparator("viewers-desc", NOW));

	expect(keys(sorted)).toEqual(["twitch:multi", "twitch:small", "kick:offline"]);
});

test("a linked pin keeps the streamer above other offline channels", () => {
	const channels = [
		channel("twitch", "recent", { lastLiveAt: NOW }),
		channel("twitch", "pinned", { lastLiveAt: NOW - 100 }),
		channel("kick", "pinned", { pinned: true }),
	];

	const merged = mergeLinkedChannels(channels, [link("pinned", "pinned")], "live", "twitch");
	const sorted = [...merged].sort(getFollowsComparator("recommended", NOW));

	expect(keys(sorted)).toEqual(["twitch:pinned", "twitch:recent"]);
});

test("suggests channels with the same login on both platforms", () => {
	const channels = [
		channel("twitch", "same"),
		channel("kick", "same"),
		channel("twitch", "linked"),
		channel("kick", "linked"),
		channel("twitch", "no"),
		channel("kick", "no"),
		channel("kick", "only_kick"),
	];

	const suggestions = findLinkSuggestions(channels, [
		link("linked", "linked_other"),
		link("no", "no", { dismissed: true }),
	]);

	expect(suggestions.map((item) => [item.twitch.login, item.kick.login])).toEqual([["same", "same"]]);
});

test("linking a channel replaces its previous link but keeps dismissed suggestions", () => {
	const links = [record("a", "old"), record("other", "b"), record("a", "a", { dismissed: true }), record("c", "d")];

	expect(getConflictingLinkIds(links, record("a", "b"))).toEqual(["a:old", "other:b"]);
	expect(getConflictingLinkIds(links, record("a", "b", { dismissed: true }))).toEqual([]);
});

test("a linked streamer matches a platform filter when live there", () => {
	const channels = [
		channel("twitch", "a", { live: true, viewers: 1 }),
		channel("kick", "a"),
		channel("twitch", "b"),
		channel("kick", "b"),
	];
	const [live, offline] = mergeLinkedChannels(channels, [link("a", "a"), link("b", "b")], "live", "twitch");

	expect(matchesFollowsPlatform(live, "twitch")).toBe(true);
	expect(matchesFollowsPlatform(live, "kick")).toBe(false);
	expect(matchesFollowsPlatform(offline, "kick")).toBe(true);
	expect(matchesFollowsPlatform(channel("kick", "c"), "twitch")).toBe(false);
});
