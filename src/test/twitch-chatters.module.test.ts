import { expect, test } from "bun:test";
import ChattersModule from "$twitch/modules/chatters/chatters.module.tsx";

function createChattersModule(twitchUtils: unknown) {
	return new ChattersModule(
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		{} as never,
		twitchUtils as never,
		{} as never,
	);
}

test("keeps shared channel discovery in moderator view", () => {
	const module = createChattersModule({
		getStreamInfo: () => ({
			channelLogin: "host",
			costreamDetails: { topCostreamers: [{ login: "guest" }] },
			guestList: [{ user: { login: "new-guest" } }],
		}),
		getChatInfo: () => ({
			props: {
				sharedChatDataByChannelID: new Map([
					["1", { login: "guest", status: "ACTIVE" }],
					["2", { login: "chat-guest", status: "ACTIVE" }],
					["3", { login: "inactive", status: "INACTIVE" }],
				]),
			},
		}),
		isModeratorView: () => true,
		isDirectTwitchPlayer: () => false,
	});

	expect((module as any).getLoginsOrIsAllowedPage()).toEqual(["host", "guest", "new-guest", "chat-guest"]);
});

test("waits for stream information on an ordinary channel page", () => {
	const module = createChattersModule({
		getStreamInfo: () => undefined,
		getChatInfo: () => undefined,
		isModeratorView: () => false,
		isDirectTwitchPlayer: () => false,
	});
	(module as any).isStreamManagerPage = () => false;

	expect((module as any).getLoginsOrIsAllowedPage()).toBeUndefined();
});

test("allows stream manager counters before stream information arrives", () => {
	const module = createChattersModule({
		getStreamInfo: () => undefined,
		getChatInfo: () => undefined,
		isModeratorView: () => false,
		isDirectTwitchPlayer: () => false,
	});
	(module as any).isStreamManagerPage = () => true;

	expect((module as any).getLoginsOrIsAllowedPage()).toBe(true);
});
