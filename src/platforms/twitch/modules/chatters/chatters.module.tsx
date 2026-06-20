import { TooltipComponent } from "$shared/components/tooltip/tooltip.component.tsx";
import { ChattersQuery, CollaborativeViewersQuery } from "$twitch/apis/twitch-queries.ts";
import type { ChattersResponse, CollaborativeViewersResponse } from "$types/platforms/twitch/twitch.api.types.ts";
import type { ChannelDescription, CollaborativeViewer } from "$types/platforms/twitch/twitch.utils.types.ts";
import type { TwitchModuleConfig } from "$types/shared/module/module.types.ts";
import { type Signal, signal } from "@preact/signals";
import { type ComponentChildren, render } from "preact";
import { createPortal } from "preact/compat";
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import styled from "styled-components";
import TwitchModule from "../../twitch.module.ts";

export default class ChattersModule extends TwitchModule {
	private static URL_CONFIG = (url: string) =>
		!url.includes("clips.twitch.tv") && !url.includes("/team/") && !url.includes("/directory/");
	public static LOADING_VALUE = -1;

	config: TwitchModuleConfig = {
		name: "chatters",
		enabled: () => this.settings().chattersEnabled,
		appliers: [
			{
				type: "selector",
				selectors: ['strong[data-a-target="animated-channel-viewers-count"]'],
				callback: this.createTotalChattersComponent.bind(this),
				key: "chatters",
				validateUrl: ChattersModule.URL_CONFIG,
				useParent: true,
				once: true,
			},
			{
				type: "selector",
				selectors: [
					'div[data-a-target="channel-viewers-count"]',
					'p[data-test-selector="stream-info-card-component__description"]',
				],
				callback: this.createTotalChattersComponent.bind(this),
				key: "chatters",
				validateUrl: ChattersModule.URL_CONFIG,
				once: true,
			},
			{
				type: "selector",
				selectors: [".sunlight-live-indicator"],
				callback: this.createTotalChattersComponent.bind(this),
				key: "chatters-stream-manager",
				validateUrl: (url) => url.includes("/stream-manager") || url.includes("/moderator/"),
				useParent: true,
				once: true,
			},
			{
				type: "selector",
				selectors: [".ffz-stat-text.tw-stat__value"],
				callback: this.createTotalChattersComponent.bind(this),
				key: "chatters-ffz",
				validateUrl: ChattersModule.URL_CONFIG,
				useParent: true,
				once: true,
			},
			{
				type: "selector",
				selectors: [".tw-dialog-layer .tw-transition .tw-balloon"],
				callback: this.createIndividualChattersComponents.bind(this),
				key: "shared-chatters",
				validateUrl: ChattersModule.URL_CONFIG,
				useParent: true,
				once: true,
			},
			{
				type: "event",
				event: "twitch:chatInitialized",
				callback: this.reloadCounters.bind(this),
				key: "chatters",
			},
		],
	};

	private totalChattersCounter = signal(ChattersModule.LOADING_VALUE);
	private totalCollaborativeViewersCounter = signal(ChattersModule.LOADING_VALUE);
	private collaborativeViewers = signal<CollaborativeViewer[]>([]);
	private channelDescription = signal<ChannelDescription | null | undefined>(undefined);
	private chattersCounters: Record<string, Signal<number>> = {};
	private hasModeratorCounter = false;

	private updateInterval: NodeJS.Timeout | undefined;
	private lastUpdatedAt = 0;

	private static INDIVIDUAL_CHATTERS_COMPONENT_WRAPPER_CLASS = "enhancer-chat-counter-wrapper";
	private static UPDATE_INTERVAL_TIME = 30000;

	private findUsernameFromStatusIndicator(el?: Element | null): string | null {
		const container = el?.parentElement?.parentElement?.parentElement;
		return container?.querySelector("p")?.textContent ?? null;
	}

	private getUniqueLogins(channelList: string[] | undefined): string[] {
		return [
			...new Set<string>(
				[
					this.twitchUtils().getCurrentChannelByUrl(),
					this.twitchUtils().getCurrentChannelFromDirectTwitchPlayer(),
					...(channelList ?? []),
				].filter(Boolean) as string[],
			),
		];
	}

	private getFilteredIndicators(root: Element): Element[] {
		return Array.from(root.querySelectorAll(".tw-channel-status-indicator")).filter(
			(el) => !el.closest(".online-side-nav-channel-tooltip__body"),
		);
	}

	private async createTotalChattersComponent(elements: Element[], key: string) {
		if (!(await this.isModuleEnabled())) return;
		const wrappers = this.commonUtils().createEmptyElements(this.getId(), elements, "span");
		const isModeratorCounter = key === "chatters-stream-manager" || this.twitchUtils().isModeratorView();
		this.hasModeratorCounter ||= isModeratorCounter;

		this.requestUpdate();
		if (this.updateInterval) clearInterval(this.updateInterval);
		this.updateInterval = setInterval(() => this.requestUpdate(), ChattersModule.UPDATE_INTERVAL_TIME);

		wrappers.forEach((element) => {
			if (isModeratorCounter) {
				render(
					<ModeratorCountersComponent
						chatters={this.totalChattersCounter}
						chattersByLogin={this.chattersCounters}
						channelDescription={this.channelDescription}
						collaborativeViewers={this.collaborativeViewers}
						mainLogin={this.twitchUtils().getCurrentChannelByUrl()}
						refresh={this.refreshCounters.bind(this)}
						viewers={this.totalCollaborativeViewersCounter}
					/>,
					element,
				);
				return;
			}
			render(
				<TooltipComponent
					content={
						<span>Chatters are logged-in users in a Twitch stream’s chatroom. Click here to refresh the counter.</span>
					}
					position="right"
				>
					<ChattersComponent click={this.refreshChatters.bind(this)} counter={this.totalChattersCounter} />
				</TooltipComponent>,
				element,
			);
		});
	}

	private async createIndividualChattersComponents(elements: Element[]) {
		if (!(await this.isModuleEnabled())) return;
		await this.commonUtils().delay(300);
		elements.forEach((root) => {
			const indicators = this.getFilteredIndicators(root);

			indicators.forEach((indicator) => {
				const username = this.findUsernameFromStatusIndicator(indicator)?.toLowerCase();
				if (!username) return;

				const counter = this.getOrCreateCounter(username, ChattersModule.LOADING_VALUE);
				if (counter !== undefined && indicator.parentElement) {
					let existing = indicator.parentElement.querySelector(
						`.${ChattersModule.INDIVIDUAL_CHATTERS_COMPONENT_WRAPPER_CLASS}`,
					);
					if (!existing) {
						existing = document.createElement("span");
						existing.className = ChattersModule.INDIVIDUAL_CHATTERS_COMPONENT_WRAPPER_CLASS;
						indicator.parentElement.appendChild(existing);
					}
					render(<ChattersComponent click={this.refreshChatters.bind(this)} counter={counter} />, existing);
				}
			});
		});

		const loadingLogins = Object.keys(this.chattersCounters).filter(
			(login) => this.chattersCounters[login].value === ChattersModule.LOADING_VALUE,
		);

		if (loadingLogins.length > 0) {
			await this.refreshChatters(loadingLogins);
		}
	}

	private async refreshChatters(loginsToUpdate: string[] = []) {
		await this.commonUtils().waitFor(
			() => this.getLoginsOrIsAllowedPage(),
			async (channelList) => {
				const uniqueLogins = this.getUniqueLogins(channelList === true ? undefined : channelList);
				this.logger.debug("Refreshing chatters for", uniqueLogins);

				const logins =
					loginsToUpdate.length > 0 ? uniqueLogins.filter((login) => loginsToUpdate.includes(login)) : uniqueLogins;

				await Promise.all(
					logins.map(async (login) => {
						try {
							const { data } = await this.twitchApi().gql<ChattersResponse>(ChattersQuery, {
								name: login.toLowerCase(),
							});
							const counter = this.getOrCreateCounter(login, data.channel.chatters.count);
							counter.value = data.channel.chatters.count;
							this.logger.info(`Refreshed chatters for ${login}`, counter.value);
						} catch (error) {
							this.logger.warn(`Failed to fetch chatters for ${login}`, error);
						}
					}),
				);

				for (const activeLogin of Object.keys(this.chattersCounters)) {
					if (!uniqueLogins.includes(activeLogin)) {
						delete this.chattersCounters[activeLogin];
					}
				}

				this.updateTotalChattersCounter();
				this.lastUpdatedAt = Date.now();
				return true;
			},
			{ delay: 1000, maxRetries: 5, initialDelay: 30 },
		);
	}

	private getLoginsOrIsAllowedPage() {
		const logins = this.getLogins();
		if (logins.length > 0) return logins;
		return this.twitchUtils().isDirectTwitchPlayer() || this.twitchUtils().isModeratorView() || undefined;
	}

	private getLogins(): string[] {
		const streamInfo = this.twitchUtils().getStreamInfo();
		const sharedChatLogins = Array.from(
			this.twitchUtils().getChatInfo()?.props.sharedChatDataByChannelID.values() ?? [],
		)
			.filter((channel) => channel.status === "ACTIVE")
			.map((channel) => channel.login);
		const organizerLogin = streamInfo?.channelLogin;
		const costreamerLogins = streamInfo?.costreamDetails?.topCostreamers.map((streamer) => streamer.login) ?? [];
		const guestStarLogins = streamInfo?.guestStarGuests.map((guest) => guest.user.login) ?? [];
		const allLoginsWithDuplicates = [
			this.twitchUtils().getCurrentChannelByUrl(),
			organizerLogin,
			...costreamerLogins,
			...guestStarLogins,
			...sharedChatLogins,
		];
		const validLogins = allLoginsWithDuplicates.filter((login): login is string => login != null);
		return Array.from(new Set(validLogins));
	}

	private async refreshCollaborativeViewers() {
		const logins = this.getLogins();
		if (logins.length === 0) return;
		const mainLogin = this.twitchUtils().getCurrentChannelByUrl();

		try {
			const { data } = await this.twitchApi().gql<CollaborativeViewersResponse>(CollaborativeViewersQuery, {
				logins,
				mainLogin,
			});
			const mainChannel = data.user;
			this.channelDescription.value = mainChannel
				? {
						login: mainChannel.login,
						displayName: mainChannel.displayName,
						profileImageURL: mainChannel.profileImageURL,
						description: mainChannel.description,
						socialLinks: mainChannel.channel.socialMedias.filter((socialLink) => isSafeExternalUrl(socialLink.url)),
						panels: mainChannel.panels
							.filter((panel) => panel.type === "DEFAULT")
							.map((panel) => ({
								id: panel.id,
								title: panel.title ?? null,
								description: panel.description ?? null,
								imageURL: panel.imageURL ?? null,
								linkURL: panel.linkURL && isSafeExternalUrl(panel.linkURL) ? panel.linkURL : null,
							}))
							.filter((panel) => panel.title || panel.description || panel.imageURL),
					}
				: null;
			const viewers = data.users
				.filter((user) => user.stream)
				.map((user) => ({
					login: user.login.toLowerCase(),
					displayName: user.displayName,
					profileImageURL: user.profileImageURL,
					viewersCount: user.stream?.viewersCount ?? 0,
				}));
			this.collaborativeViewers.value = viewers;
			this.totalCollaborativeViewersCounter.value = viewers.reduce((sum, viewer) => sum + viewer.viewersCount, 0);
		} catch (error) {
			this.channelDescription.value = null;
			this.logger.warn("Failed to fetch collaborative viewers", error);
		}
	}

	private updateTotalChattersCounter() {
		const chatterSignals = Object.values(this.chattersCounters);
		if (chatterSignals.length === 0) return ChattersModule.LOADING_VALUE;
		this.totalChattersCounter.value = chatterSignals.reduce((sum, chatterSignal) => {
			return chatterSignal.value === ChattersModule.LOADING_VALUE ? sum : sum + chatterSignal.value;
		}, 0);
	}

	private getOrCreateCounter(login: string, value: number) {
		let counter = this.chattersCounters[login];
		if (!counter) {
			counter = signal(value);
			this.chattersCounters[login] = counter;
		}
		return counter;
	}

	private async requestUpdate() {
		if (this.lastUpdatedAt + ChattersModule.UPDATE_INTERVAL_TIME * 0.75 >= Date.now()) {
			await Promise.all([
				this.updateAllEmptyCounters(),
				this.hasModeratorCounter && this.totalCollaborativeViewersCounter.value === ChattersModule.LOADING_VALUE
					? this.refreshCollaborativeViewers()
					: Promise.resolve(),
			]);
			return;
		}
		await this.refreshCounters();
	}

	private async refreshCounters() {
		await Promise.all([
			this.refreshChatters(),
			this.hasModeratorCounter ? this.refreshCollaborativeViewers() : Promise.resolve(),
		]);
	}

	private async updateAllEmptyCounters() {
		const emptyLogins = Object.entries(this.chattersCounters)
			.filter(([_, counter]) => {
				return counter.value === ChattersModule.LOADING_VALUE;
			})
			.map(([login]) => {
				return login;
			});
		if (emptyLogins.length < 1) return;
		await this.refreshChatters(emptyLogins);
	}

	private async reloadCounters() {
		if (!(await this.isModuleEnabled())) return;
		Object.values(this.chattersCounters).forEach((counter) => {
			counter.value = ChattersModule.LOADING_VALUE;
		});
		this.totalChattersCounter.value = ChattersModule.LOADING_VALUE;
		this.totalCollaborativeViewersCounter.value = ChattersModule.LOADING_VALUE;
		this.channelDescription.value = undefined;
		await this.refreshCounters();
	}
}

const Wrapper = styled.span`
	margin-left: 4px;
	color: #ff8280;
	font-weight: 600 !important;
	white-space: nowrap;

	&:hover {
		opacity: 0.75;
		cursor: pointer;
	}
`;

const ModeratorCounter = styled(Wrapper)`
	margin-left: 8px;
`;

const ModeratorControls = styled.span`
	display: inline-flex;
	align-items: center;
	gap: 6px;
`;

const ChannelDescriptionButton = styled.button`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 30px;
	height: 30px;
	padding: 0;
	border: 0;
	border-radius: var(--border-radius-medium, 4px);
	background: transparent;
	color: #dedee3;
	cursor: pointer;
	transition:
		background-color 160ms ease-out,
		color 160ms ease-out;

	&:hover {
		background-color: var(--color-background-button-text-hover, rgba(255, 255, 255, 0.12));
		color: #f7f7f8;
	}

	&:focus-visible {
		outline: 2px solid #bf94ff;
		outline-offset: 2px;
	}

	svg {
		width: 20px;
		height: 20px;
		fill: currentColor;
	}
`;

const ChannelDescriptionOverlay = styled.dialog`
	position: fixed;
	inset: 0;
	z-index: 999999999999;
	display: flex;
	flex-direction: column;
	width: 100%;
	height: 100%;
	max-width: none;
	max-height: none;
	margin: 0;
	padding: 0;
	border: 0;
	overflow: hidden;
	background: rgba(14, 14, 16, 0.76);
	color: #efeff1;
	backdrop-filter: blur(16px) saturate(0.82);
	font-family: Inter, Roobert, "Helvetica Neue", Helvetica, Arial, sans-serif;
`;

const ChannelDescriptionHeader = styled.header`
	display: flex;
	align-items: center;
	justify-content: space-between;
	min-height: 64px;
	padding: 0 24px;
	border-bottom: 1px solid rgba(239, 239, 241, 0.12);
	background: rgba(24, 24, 27, 0.72);
	backdrop-filter: blur(20px);
`;

const ChannelDescriptionTitle = styled.h2`
	margin: 0;
	font-size: 20px;
	font-weight: 700;
	line-height: 1.2;
`;

const ChannelDescriptionCloseButton = styled(ChannelDescriptionButton)`
	flex: 0 0 auto;
	width: 40px;
	height: 40px;
`;

const ChannelDescriptionScrollArea = styled.div`
	flex: 1;
	overflow: auto;
	padding: 48px 24px 64px;
`;

const ChannelDescriptionContent = styled.div`
	width: min(1040px, 100%);
	margin: 0 auto;
`;

const ChannelDescriptionProfile = styled.div`
	display: grid;
	grid-template-columns: 96px minmax(0, 1fr);
	align-items: center;
	gap: 24px;
	margin-bottom: 40px;

	@media (max-width: 560px) {
		grid-template-columns: 72px minmax(0, 1fr);
		gap: 16px;
		margin-bottom: 32px;
	}
`;

const ChannelDescriptionAvatar = styled.img`
	width: 96px;
	height: 96px;
	border-radius: 50%;
	object-fit: cover;

	@media (max-width: 560px) {
		width: 72px;
		height: 72px;
	}
`;

const ChannelDescriptionName = styled.h1`
	margin: 0 0 6px;
	font-size: 32px;
	font-weight: 700;
	line-height: 1.15;
	word-break: break-word;

	@media (max-width: 560px) {
		font-size: 24px;
	}
`;

const ChannelDescriptionLogin = styled.a`
	color: #adadb8;
	font-size: 15px;
	text-decoration: none;

	&:hover {
		color: #bf94ff;
		text-decoration: underline;
	}

	&:focus-visible {
		outline: 2px solid #bf94ff;
		outline-offset: 2px;
	}
`;

const ChannelDescriptionText = styled.p`
	max-width: 70ch;
	margin: 0;
	color: #dedee3;
	font-size: 18px;
	line-height: 1.7;
	overflow-wrap: anywhere;
	white-space: pre-wrap;
`;

const ChannelDescriptionLinks = styled.nav`
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	margin-top: 24px;
`;

const ChannelDescriptionLink = styled.a`
	display: inline-flex;
	align-items: center;
	min-height: 36px;
	padding: 0 14px;
	border: 1px solid #3f3f46;
	border-radius: 999px;
	color: #dedee3;
	font-size: 14px;
	font-weight: 600;
	text-decoration: none;
	transition:
		border-color 160ms ease-out,
		background-color 160ms ease-out,
		color 160ms ease-out;

	&:hover {
		border-color: #9147ff;
		background: #26262c;
		color: #f7f7f8;
	}

	&:focus-visible {
		outline: 2px solid #bf94ff;
		outline-offset: 2px;
	}
`;

const InlineExternalLink = styled.a`
	color: #bf94ff;
	text-decoration: underline;
	text-decoration-thickness: 1px;
	text-underline-offset: 3px;

	&:hover {
		color: #d1b3ff;
	}

	&:focus-visible {
		outline: 2px solid #bf94ff;
		outline-offset: 2px;
	}
`;

const ChannelPanelsSection = styled.section`
	margin-top: 48px;
	padding-top: 32px;
	border-top: 1px solid #2f2f35;
`;

const ChannelPanelsTitle = styled.h2`
	margin: 0 0 24px;
	font-size: 22px;
	font-weight: 700;
	line-height: 1.25;
`;

const ChannelPanelsGrid = styled.div`
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 320px));
	align-items: start;
	justify-content: center;
	gap: 32px 24px;
`;

const ChannelPanel = styled.article`
	width: 100%;
	overflow: hidden;
`;

const ChannelPanelImageLink = styled.a`
	display: block;
	border-radius: 6px;

	&:focus-visible {
		outline: 2px solid #bf94ff;
		outline-offset: 3px;
	}
`;

const ChannelPanelImage = styled.img`
	display: block;
	width: 100%;
	height: auto;
	border-radius: 6px;
`;

const ChannelPanelTitle = styled.h3`
	margin: 14px 0 0;
	color: #efeff1;
	font-size: 18px;
	font-weight: 700;
	line-height: 1.35;
`;

const ChannelPanelDescription = styled.p`
	margin: 10px 0 0;
	color: #c7c7cf;
	font-size: 14px;
	line-height: 1.55;
	overflow-wrap: anywhere;
	white-space: pre-wrap;
`;

const ChannelDescriptionState = styled.p`
	margin: 0;
	color: #adadb8;
	font-size: 16px;
	line-height: 1.5;
`;

const CollaborativeViewersCard = styled.div`
	width: 360px;
	margin: -12px -16px;
	overflow: hidden;
	border-radius: 8px;
	background: rgba(18, 18, 22, 0.96);
	color: #efeff1;
`;

const CollaborativeViewersHeader = styled.div`
	padding: 16px;
	border-bottom: 1px solid rgba(239, 239, 241, 0.1);
	background: rgba(35, 31, 42, 0.72);
`;

const CollaborativeViewersEyebrow = styled.div`
	margin-bottom: 4px;
	color: #bf94ff;
	font-size: 11px;
	font-weight: 700;
	letter-spacing: 0.08em;
	line-height: 1.2;
	text-transform: uppercase;
`;

const CollaborativeViewersTitleRow = styled.div`
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
`;

const CollaborativeViewersTitle = styled.div`
	font-size: 17px;
	font-weight: 700;
	line-height: 1.3;
`;

const CollaborativeViewersCount = styled.span`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 24px;
	height: 24px;
	padding: 0 7px;
	border-radius: 999px;
	background: rgba(145, 71, 255, 0.2);
	color: #d8bfff;
	font-size: 12px;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
`;

const CollaborativeViewersSummary = styled.div`
	display: grid;
	grid-template-columns: repeat(2, minmax(0, 1fr));
	gap: 8px;
	margin-top: 14px;
`;

const CollaborativeViewersSummaryItem = styled.div`
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 8px;
	padding: 9px 10px;
	border: 1px solid rgba(239, 239, 241, 0.08);
	border-radius: 6px;
	background: rgba(14, 14, 16, 0.46);
`;

const CollaborativeViewersSummaryLabel = styled.span`
	color: #adadb8;
	font-size: 11px;
	font-weight: 600;
`;

const CollaborativeViewersSummaryValue = styled.span<{ $accent?: boolean }>`
	color: ${({ $accent }) => ($accent ? "#ff8280" : "#efeff1")};
	font-size: 14px;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
`;

const CollaborativeViewersList = styled.div`
	display: flex;
	flex-direction: column;
	max-height: 360px;
	padding: 6px;
	overflow-y: auto;
`;

const CollaborativeViewerRow = styled.a`
	display: grid;
	grid-template-columns: 40px minmax(0, 1fr) auto;
	align-items: center;
	gap: 10px;
	min-height: 56px;
	padding: 8px 10px;
	border-radius: 6px;
	color: inherit;
	text-decoration: none;
	transition:
		background-color 150ms ease-out,
		transform 150ms ease-out;

	&:hover {
		background-color: rgba(145, 71, 255, 0.12);
		transform: translateX(2px);
	}

	&:focus-visible {
		outline: 2px solid #bf94ff;
		outline-offset: -2px;
	}
`;

const CollaborativeViewerAvatarWrapper = styled.span`
	position: relative;
	display: block;
	width: 40px;
	height: 40px;
`;

const CollaborativeViewerAvatar = styled.img`
	width: 40px;
	height: 40px;
	border-radius: 50%;
	object-fit: cover;
`;

const CollaborativeViewerIdentity = styled.span`
	display: flex;
	min-width: 0;
	flex-direction: column;
	gap: 2px;
`;

const CollaborativeViewerName = styled.span`
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
	font-size: 14px;
	font-weight: 650;
	line-height: 1.25;
`;

const CollaborativeViewerLogin = styled.span`
	overflow: hidden;
	color: #8f8f9a;
	font-size: 11px;
	line-height: 1.2;
	text-overflow: ellipsis;
	white-space: nowrap;
`;

const CollaborativeViewerMetrics = styled.span`
	display: flex;
	align-items: flex-end;
	flex-direction: column;
	gap: 4px;
	white-space: nowrap;
	font-variant-numeric: tabular-nums;
`;

const CollaborativeViewerMetric = styled.span<{ $accent?: boolean }>`
	display: inline-flex;
	align-items: center;
	gap: 4px;
	color: ${({ $accent }) => ($accent ? "#ff8280" : "#c7c7cf")};
	font-size: 12px;
	font-weight: 650;

	svg {
		width: 13px;
		height: 13px;
		fill: currentColor;
	}
`;

const LiveIndicator = styled.span`
	position: absolute;
	right: -1px;
	bottom: -1px;
	width: 8px;
	height: 8px;
	border: 2px solid #121216;
	border-radius: 50%;
	background-color: #e91916;
`;

const CollaborativeViewersEmpty = styled.div`
	padding: 28px 18px;
	color: #8f8f9a;
	font-size: 13px;
	line-height: 1.45;
	text-align: center;
`;

const formatChatters = (chatters: number) =>
	Math.abs(chatters) < 10000 ? chatters.toString() : chatters.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const ChattersComponent = ({
	click,
	counter,
}: {
	counter: Signal<number>;
	click: () => void;
}) => {
	const chatters = counter.value === ChattersModule.LOADING_VALUE ? "Loading..." : formatChatters(counter.value);

	return <Wrapper onClick={click}>({chatters})</Wrapper>;
};

const ModeratorCountersComponent = ({
	chatters,
	chattersByLogin,
	channelDescription,
	collaborativeViewers,
	mainLogin,
	refresh,
	viewers,
}: {
	chatters: Signal<number>;
	chattersByLogin: Record<string, Signal<number>>;
	channelDescription: Signal<ChannelDescription | null | undefined>;
	collaborativeViewers: Signal<CollaborativeViewer[]>;
	mainLogin: string;
	refresh: () => void;
	viewers: Signal<number>;
}) => {
	const [isDescriptionOpen, setIsDescriptionOpen] = useState(false);
	const descriptionButtonRef = useRef<HTMLButtonElement>(null);
	const closeDescription = useCallback(() => setIsDescriptionOpen(false), []);
	const viewersValue = viewers.value === ChattersModule.LOADING_VALUE ? "Loading..." : formatChatters(viewers.value);
	const chattersValue = chatters.value === ChattersModule.LOADING_VALUE ? "Loading..." : formatChatters(chatters.value);
	const mainChatters = chattersByLogin[mainLogin.toLowerCase()];
	const mainChattersValue =
		!mainChatters || mainChatters.value === ChattersModule.LOADING_VALUE
			? "Loading..."
			: formatChatters(mainChatters.value);

	return (
		<ModeratorControls>
			<TooltipComponent
				content={
					<CollaborativeViewersCard>
						<CollaborativeViewersHeader>
							<CollaborativeViewersEyebrow>Shared audience</CollaborativeViewersEyebrow>
							<CollaborativeViewersTitleRow>
								<CollaborativeViewersTitle>Live channels</CollaborativeViewersTitle>
								<CollaborativeViewersCount>{collaborativeViewers.value.length}</CollaborativeViewersCount>
							</CollaborativeViewersTitleRow>
							<CollaborativeViewersSummary>
								<CollaborativeViewersSummaryItem>
									<CollaborativeViewersSummaryLabel>Viewers</CollaborativeViewersSummaryLabel>
									<CollaborativeViewersSummaryValue>{viewersValue}</CollaborativeViewersSummaryValue>
								</CollaborativeViewersSummaryItem>
								<CollaborativeViewersSummaryItem>
									<CollaborativeViewersSummaryLabel>Chatters</CollaborativeViewersSummaryLabel>
									<CollaborativeViewersSummaryValue $accent>{chattersValue}</CollaborativeViewersSummaryValue>
								</CollaborativeViewersSummaryItem>
							</CollaborativeViewersSummary>
						</CollaborativeViewersHeader>
						<CollaborativeViewersList>
							{collaborativeViewers.value.length === 0 && (
								<CollaborativeViewersEmpty>No live collaborative channels found.</CollaborativeViewersEmpty>
							)}
							{collaborativeViewers.value.map((viewer) => {
								const chatterCounter = chattersByLogin[viewer.login];
								const chatterValue =
									!chatterCounter || chatterCounter.value === ChattersModule.LOADING_VALUE
										? "Loading..."
										: formatChatters(chatterCounter.value);

								return (
									<CollaborativeViewerRow
										href={`https://www.twitch.tv/${encodeURIComponent(viewer.login)}`}
										key={viewer.login}
										rel="noopener noreferrer"
										target="_blank"
									>
										<CollaborativeViewerAvatarWrapper>
											<CollaborativeViewerAvatar alt="" src={viewer.profileImageURL} />
											<LiveIndicator />
										</CollaborativeViewerAvatarWrapper>
										<CollaborativeViewerIdentity>
											<CollaborativeViewerName>{viewer.displayName}</CollaborativeViewerName>
											<CollaborativeViewerLogin>@{viewer.login}</CollaborativeViewerLogin>
										</CollaborativeViewerIdentity>
										<CollaborativeViewerMetrics>
											<CollaborativeViewerMetric title="Viewers">
												<svg aria-hidden="true" viewBox="0 0 20 20">
													<path d="M10 4c4.1 0 7.1 3.2 8.3 5.3a1.4 1.4 0 0 1 0 1.4C17.1 12.8 14.1 16 10 16s-7.1-3.2-8.3-5.3a1.4 1.4 0 0 1 0-1.4C2.9 7.2 5.9 4 10 4Zm0 2C7 6 4.6 8.2 3.6 10 4.6 11.8 7 14 10 14s5.4-2.2 6.4-4C15.4 8.2 13 6 10 6Zm0 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z" />
												</svg>
												{formatChatters(viewer.viewersCount)}
											</CollaborativeViewerMetric>
											<CollaborativeViewerMetric $accent title="Chatters">
												<svg aria-hidden="true" viewBox="0 0 20 20">
													<path d="M10 2a4 4 0 1 1 0 8 4 4 0 0 1 0-8ZM4 17a6 6 0 0 1 12 0v1H4v-1Z" />
												</svg>
												{chatterValue}
											</CollaborativeViewerMetric>
										</CollaborativeViewerMetrics>
									</CollaborativeViewerRow>
								);
							})}
						</CollaborativeViewersList>
					</CollaborativeViewersCard>
				}
				interactive
				maxWidth={400}
				position="top"
			>
				<ModeratorCounter onClick={refresh}>
					({mainChattersValue}) [{viewersValue} ({chattersValue})]
				</ModeratorCounter>
			</TooltipComponent>
			<ChannelDescriptionButton
				aria-label="Open full channel description"
				onClick={() => setIsDescriptionOpen(true)}
				ref={descriptionButtonRef}
				title="Open full channel description"
				type="button"
			>
				<svg aria-hidden="true" viewBox="0 0 24 24">
					<path d="M4 3h16a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 4v2h14V7H5Zm0 4v2h14v-2H5Zm0 4v2h9v-2H5Z" />
				</svg>
			</ChannelDescriptionButton>
			{isDescriptionOpen && (
				<ChannelDescriptionDialog
					channel={channelDescription.value}
					close={closeDescription}
					mainLogin={mainLogin}
					returnFocusTo={descriptionButtonRef}
				/>
			)}
		</ModeratorControls>
	);
};

const ChannelDescriptionDialog = ({
	channel,
	close,
	mainLogin,
	returnFocusTo,
}: {
	channel: ChannelDescription | null | undefined;
	close: () => void;
	mainLogin: string;
	returnFocusTo: { current: HTMLButtonElement | null };
}) => {
	const closeButtonRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		const previousOverflow = document.body.style.overflow;
		const animationFrame = requestAnimationFrame(() => closeButtonRef.current?.focus());
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") close();
		};
		document.body.style.overflow = "hidden";
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			cancelAnimationFrame(animationFrame);
			document.body.style.overflow = previousOverflow;
			window.removeEventListener("keydown", handleKeyDown);
			returnFocusTo.current?.focus();
		};
	}, [close, returnFocusTo]);

	return createPortal(
		<ChannelDescriptionOverlay aria-labelledby="enhancer-channel-description-title" aria-modal="true" open>
			<ChannelDescriptionHeader>
				<ChannelDescriptionTitle id="enhancer-channel-description-title">Channel description</ChannelDescriptionTitle>
				<ChannelDescriptionCloseButton
					aria-label="Close channel description"
					onClick={close}
					ref={closeButtonRef}
					type="button"
				>
					<svg aria-hidden="true" viewBox="0 0 24 24">
						<path d="m6.7 5.3 5.3 5.29 5.3-5.3 1.4 1.42-5.29 5.3 5.3 5.29-1.42 1.4-5.3-5.29-5.29 5.3-1.4-1.42 5.29-5.3-5.3-5.29 1.42-1.4Z" />
					</svg>
				</ChannelDescriptionCloseButton>
			</ChannelDescriptionHeader>
			<ChannelDescriptionScrollArea>
				<ChannelDescriptionContent>
					{channel === undefined && <ChannelDescriptionState>Loading channel description…</ChannelDescriptionState>}
					{channel === null && (
						<ChannelDescriptionState>Channel description is currently unavailable.</ChannelDescriptionState>
					)}
					{channel && (
						<>
							<ChannelDescriptionProfile>
								<ChannelDescriptionAvatar alt="" src={channel.profileImageURL} />
								<div>
									<ChannelDescriptionName>{channel.displayName}</ChannelDescriptionName>
									<ChannelDescriptionLogin
										href={`https://www.twitch.tv/${encodeURIComponent(channel.login || mainLogin)}`}
										rel="noopener noreferrer"
										target="_blank"
									>
										@{channel.login}
									</ChannelDescriptionLogin>
								</div>
							</ChannelDescriptionProfile>
							{channel.description ? (
								<ChannelDescriptionText>{linkifyText(channel.description)}</ChannelDescriptionText>
							) : (
								<ChannelDescriptionState>This channel has no description.</ChannelDescriptionState>
							)}
							{channel.socialLinks.length > 0 && (
								<ChannelDescriptionLinks aria-label="Channel links">
									{channel.socialLinks.map((socialLink) => (
										<ChannelDescriptionLink
											href={socialLink.url}
											key={`${socialLink.name}:${socialLink.url}`}
											rel="noopener noreferrer"
											target="_blank"
										>
											{socialLink.title || socialLink.name}
										</ChannelDescriptionLink>
									))}
								</ChannelDescriptionLinks>
							)}
							{channel.panels.length > 0 && (
								<ChannelPanelsSection>
									<ChannelPanelsTitle>Channel panels</ChannelPanelsTitle>
									<ChannelPanelsGrid>
										{channel.panels.map((panel) => (
											<ChannelPanel key={panel.id}>
												{panel.imageURL &&
													(panel.linkURL ? (
														<ChannelPanelImageLink href={panel.linkURL} rel="noopener noreferrer" target="_blank">
															<ChannelPanelImage
																alt={panel.title || `${channel.displayName} channel panel`}
																loading="lazy"
																src={panel.imageURL}
															/>
														</ChannelPanelImageLink>
													) : (
														<ChannelPanelImage
															alt={panel.title || `${channel.displayName} channel panel`}
															loading="lazy"
															src={panel.imageURL}
														/>
													))}
												{panel.title && <ChannelPanelTitle>{panel.title}</ChannelPanelTitle>}
												{panel.description && (
													<ChannelPanelDescription>{linkifyText(panel.description)}</ChannelPanelDescription>
												)}
											</ChannelPanel>
										))}
									</ChannelPanelsGrid>
								</ChannelPanelsSection>
							)}
						</>
					)}
				</ChannelDescriptionContent>
			</ChannelDescriptionScrollArea>
		</ChannelDescriptionOverlay>,
		document.body,
	);
};

const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<]+/gi;
const TRAILING_URL_PUNCTUATION = /[),.!?:;]+$/;

const isSafeExternalUrl = (value: string) => {
	const url = value.startsWith("www.") ? `https://${value}` : value;
	if (!URL.canParse(url)) return false;
	const protocol = new URL(url).protocol;
	return protocol === "https:" || protocol === "http:";
};

const linkifyText = (text: string): ComponentChildren[] => {
	const children: ComponentChildren[] = [];
	let cursor = 0;

	for (const match of text.matchAll(URL_PATTERN)) {
		const matchedUrl = match[0];
		const start = match.index;
		const trailingPunctuation = matchedUrl.match(TRAILING_URL_PUNCTUATION)?.[0] ?? "";
		const displayUrl = trailingPunctuation ? matchedUrl.slice(0, -trailingPunctuation.length) : matchedUrl;
		const href = displayUrl.startsWith("www.") ? `https://${displayUrl}` : displayUrl;

		if (start > cursor) children.push(text.slice(cursor, start));
		if (isSafeExternalUrl(href)) {
			children.push(
				<InlineExternalLink href={href} key={`${start}:${href}`} rel="noopener noreferrer" target="_blank">
					{displayUrl}
				</InlineExternalLink>,
			);
		} else {
			children.push(displayUrl);
		}
		if (trailingPunctuation) children.push(trailingPunctuation);
		cursor = start + matchedUrl.length;
	}

	if (cursor < text.length) children.push(text.slice(cursor));
	return children;
};
