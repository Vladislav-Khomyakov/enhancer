import type { Logger } from "$shared/logger/logger.ts";
import { getChannelLinkId, getConflictingLinkIds } from "$shared/utils/follows-links.utils.ts";
import type { SharedDatabase } from "$shared/worker/database/shared.database.ts";
import { MessageHandler } from "$shared/worker/message.handler.ts";
import type {
	ChannelLinkRecord,
	ChannelLinksPayload,
	UpdateChannelLinkPayload,
} from "$types/shared/worker/channel-links-worker.types.ts";
import type { WorkerBroadcast } from "$types/shared/worker/worker.types.ts";

async function readChannelLinks(database: SharedDatabase): Promise<ChannelLinksPayload> {
	const records = await database.getLinks();
	return { links: records.map(({ twitch, kick, primary, dismissed }) => ({ twitch, kick, primary, dismissed })) };
}

function normalizeLogin(value: unknown): string {
	return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export class GetChannelLinksHandler extends MessageHandler {
	constructor(
		logger: Logger,
		private readonly database: SharedDatabase,
	) {
		super(logger);
	}

	async handle(): Promise<ChannelLinksPayload> {
		return readChannelLinks(this.database);
	}
}

export class UpdateChannelLinkHandler extends MessageHandler {
	constructor(
		logger: Logger,
		private readonly database: SharedDatabase,
	) {
		super(logger);
	}

	async handle(payload: UpdateChannelLinkPayload): Promise<ChannelLinksPayload> {
		const twitch = normalizeLogin(payload?.twitch);
		const kick = normalizeLogin(payload?.kick);
		const primary = payload?.primary ?? null;
		if (!twitch || !kick || (primary !== null && !["twitch", "kick"].includes(primary))) {
			throw new Error("Invalid payload for updateChannelLink action. 'twitch' and 'kick' logins are required.");
		}

		const record: ChannelLinkRecord = {
			id: getChannelLinkId(twitch, kick),
			twitch,
			kick,
			primary: payload.dismissed === true ? null : primary,
			dismissed: payload.dismissed === true,
			updatedAt: Date.now(),
		};
		await this.database.putLink(record, getConflictingLinkIds(await this.database.getLinks(), record));

		const links = await readChannelLinks(this.database);
		const broadcast: WorkerBroadcast = { type: "channel-links-updated", payload: links };
		chrome.runtime.sendMessage(broadcast).catch(() => {});
		for (const tab of await chrome.tabs.query({})) {
			if (tab.id) chrome.tabs.sendMessage(tab.id, broadcast).catch(() => {});
		}
		return links;
	}
}
