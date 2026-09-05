import type {
	FollowedChannelSearchResult,
	FollowedChannelsSearchComponentProps,
} from "$types/platforms/twitch/followed-channels-search.types.ts";
import type { TwitchModuleConfig } from "$types/shared/module/module.types.ts";
import { type Signal, signal } from "@preact/signals";
import { render } from "preact";
import { useState } from "preact/hooks";
import styled from "styled-components";
import TwitchModule from "../../twitch.module.ts";

export default class FollowedChannelsSearchModule extends TwitchModule {
	private readonly followedChannelSelector =
		'#side-nav .side-nav-section .side-nav-card__link[data-test-selector="followed-channel"]';
	private readonly showMoreSelector = '[data-test-selector="ShowMore"]';
	private query = "";
	private observer: MutationObserver | undefined;
	private resizeObserver: ResizeObserver | undefined;
	private collapsed = false;
	private loadMoreTimer: NodeJS.Timeout | undefined;
	private loadMoreClicks = 0;
	private results: Signal<FollowedChannelSearchResult[]> = signal([]);

	readonly config: TwitchModuleConfig = {
		name: "followed-channels-search",
		appliers: [
			{
				type: "selector",
				selectors: [".followed-side-nav-header"],
				callback: this.run.bind(this),
				key: "followed-channels-search",
				once: true,
			},
		],
	};

	async initialize() {
		this.commonUtils().createGlobalStyle(`
			.enhancer-followed-channels-search {
				padding: 0 10px 8px;
			}

			.enhancer-followed-channels-search[hidden],
			#side-nav:has([data-a-target="side-nav-header-collapsed"]) .enhancer-followed-channels-search {
				display: none;
			}

			.enhancer-followed-channels-search input {
				width: 100%;
				height: 28px;
				box-sizing: border-box;
				border: 1px solid var(--color-border-input, rgba(255, 255, 255, 0.18));
				border-radius: 4px;
				background: var(--color-background-input, #18181b);
				color: var(--color-text-input, #efeff1);
				font-size: 12px;
				line-height: 18px;
				padding: 5px 8px;
				outline: none;
			}

			.enhancer-followed-channels-search input:focus {
				border-color: var(--color-border-input-focus, #9147ff);
				box-shadow: 0 0 0 1px var(--color-border-input-focus, #9147ff);
			}

			#side-nav .side-nav-card__link.enhancer-followed-channel-search-match {
				border: 1px solid var(--color-border-brand, #9147ff);
				border-radius: 4px;
				box-shadow: inset 0 0 0 1px rgba(145, 71, 255, 0.35);
			}

			.enhancer-followed-channels-search-results {
				display: flex;
				flex-direction: column;
				gap: 2px;
				margin-top: 6px;
			}

			.enhancer-followed-channels-search-result {
				display: flex;
				align-items: center;
				gap: 6px;
				min-height: 42px;
				border: 1px solid var(--color-border-brand, #9147ff);
				border-radius: 4px;
				color: inherit;
				padding: 4px 6px;
				text-decoration: none;
			}

			.enhancer-followed-channels-search-result:hover {
				background: var(--color-background-interactable-hover, rgba(255, 255, 255, 0.08));
				text-decoration: none;
			}

			.enhancer-followed-channels-search-result img {
				width: 30px;
				height: 30px;
				border-radius: 50%;
				flex: 0 0 auto;
			}

			.enhancer-followed-channels-search-result-main {
				display: flex;
				flex-direction: column;
				min-width: 0;
				flex: 1 1 auto;
			}

			.enhancer-followed-channels-search-result-name,
			.enhancer-followed-channels-search-result-game,
			.enhancer-followed-channels-search-result-status {
				min-width: 0;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
			}

			.enhancer-followed-channels-search-result-name {
				font-weight: 600;
			}

			.enhancer-followed-channels-search-result-game,
			.enhancer-followed-channels-search-result-status {
				color: var(--color-text-alt, #adadb8);
				font-size: 12px;
				line-height: 16px;
			}

			.enhancer-followed-channels-search-result-side {
				display: flex;
				align-items: center;
				gap: 4px;
				max-width: 56px;
				flex: 0 0 auto;
			}

			.enhancer-followed-channels-search-result-live-dot {
				width: 8px;
				height: 8px;
				border-radius: 50%;
				background: #eb0400;
				flex: 0 0 auto;
			}
		`);
	}

	private run(elements: Element[]) {
		const header = elements.at(0);
		if (!header || header.parentElement?.querySelector(`.${this.getId()}`)) return;

		const wrapper = document.createElement("div");
		wrapper.classList.add(this.getId(), "enhancer-followed-channels-search");
		header.after(wrapper);

		render(
			<FollowedChannelsSearchComponent
				initialValue={this.query}
				results={this.results}
				onSearch={(value) => this.search(value)}
			/>,
			wrapper,
		);
		this.createObserver();
	}

	private search(value: string) {
		this.query = this.normalize(value);
		this.loadMoreClicks = 0;
		this.applyFilter();

		if (this.query.length > 0 && !this.collapsed) {
			this.scheduleLoadMore();
		} else {
			this.results.value = [];
			this.stopLoadMore();
		}
	}

	private createObserver() {
		const sideNav = document.querySelector("#side-nav");
		if (!sideNav) return;

		this.observer?.disconnect();
		this.resizeObserver?.disconnect();
		const update = () => {
			this.updateVisibility(sideNav);
			this.applyFilter();
		};
		this.observer = new MutationObserver((records) => {
			if (records.every((record) => record.target instanceof Element && record.target.closest(`.${this.getId()}`)))
				return;
			update();
		});
		this.observer.observe(sideNav, {
			childList: true,
			subtree: true,
			attributes: true,
			attributeFilter: ["data-a-target", "aria-hidden"],
		});
		this.resizeObserver = new ResizeObserver(update);
		this.resizeObserver.observe(sideNav);
		update();
	}

	private updateVisibility(sideNav: Element) {
		const collapsed =
			sideNav.getBoundingClientRect().width < 100 ||
			sideNav.getAttribute("aria-hidden") === "true" ||
			!!sideNav.querySelector('[data-a-target="side-nav-header-collapsed"]');
		const wasCollapsed = this.collapsed;
		this.collapsed = collapsed;
		for (const wrapper of sideNav.querySelectorAll<HTMLElement>(`.${this.getId()}`)) {
			wrapper.hidden = collapsed;
		}
		if (collapsed) this.stopLoadMore();
		else if (wasCollapsed && this.query.length > 0) this.scheduleLoadMore();
	}

	private applyFilter() {
		const channels = document.querySelectorAll<HTMLElement>(this.followedChannelSelector);
		const results: FollowedChannelSearchResult[] = [];
		const resultHrefs = new Set<string>();

		for (const channel of channels) {
			const isMatch =
				!this.collapsed && this.query.length > 0 && this.getChannelSearchText(channel).includes(this.query);
			channel.classList.toggle("enhancer-followed-channel-search-match", isMatch);

			if (!isMatch) continue;
			const result = this.getChannelResult(channel);
			if (!result || resultHrefs.has(result.href)) continue;
			results.push(result);
			resultHrefs.add(result.href);
		}

		if (JSON.stringify(this.results.peek()) !== JSON.stringify(results)) this.results.value = results;
	}

	private scheduleLoadMore() {
		this.stopLoadMore();
		this.loadMoreTimer = setInterval(() => this.loadMoreChannels(), 300);
		this.loadMoreChannels();
	}

	private stopLoadMore() {
		if (this.loadMoreTimer) clearInterval(this.loadMoreTimer);
		this.loadMoreTimer = undefined;
	}

	private loadMoreChannels() {
		if (this.collapsed || this.query.length === 0) {
			this.stopLoadMore();
			return;
		}

		const button = document
			.querySelector<HTMLElement>(".followed-side-nav-header")
			?.closest(".side-nav-section")
			?.querySelector<HTMLElement>(this.showMoreSelector);
		const isDisabled = button instanceof HTMLButtonElement && button.disabled;
		if (!button || isDisabled || this.loadMoreClicks >= 40) {
			this.stopLoadMore();
			this.applyFilter();
			return;
		}

		this.loadMoreClicks += 1;
		button.click();
		this.applyFilter();
	}

	private getChannelSearchText(channel: HTMLElement): string {
		const title = channel.querySelector<HTMLElement>('p[data-a-target="side-nav-title"]')?.textContent ?? "";
		const hrefName =
			channel instanceof HTMLAnchorElement ? channel.href.substring(channel.href.lastIndexOf("/") + 1) : "";
		return this.normalize(`${title} ${hrefName} ${channel.textContent ?? ""}`);
	}

	private getChannelResult(channel: HTMLElement): FollowedChannelSearchResult | null {
		if (!(channel instanceof HTMLAnchorElement)) return null;
		const title = channel.querySelector<HTMLElement>('p[data-a-target="side-nav-title"]')?.textContent?.trim();
		const login = channel.href.substring(channel.href.lastIndexOf("/") + 1);
		const name = title || login;
		if (!name) return null;

		return {
			avatarUrl: channel.querySelector<HTMLImageElement>(".side-nav-card__avatar img")?.src,
			game: this.getGameText(channel, title),
			href: channel.href,
			name,
			status: this.getStatusText(channel),
		};
	}

	private getGameText(channel: HTMLElement, title?: string): string | undefined {
		const game =
			channel.querySelector<HTMLElement>('[data-a-target="side-nav-game-title"]')?.textContent?.trim() ||
			channel.querySelector<HTMLElement>(".side-nav-card__metadata")?.textContent?.trim();
		if (game && game !== title) return game;

		return this.getCardTextLines(channel, title).find((line) => !this.isStatusText(line));
	}

	private getStatusText(channel: HTMLElement): string | undefined {
		return (
			channel.querySelector<HTMLElement>('[data-a-target="side-nav-viewers-count"]')?.textContent?.trim() ||
			channel.querySelector<HTMLElement>('[data-a-target="side-nav-channel-status"]')?.textContent?.trim() ||
			this.getCardTextLines(channel).find((line) => this.isStatusText(line))
		);
	}

	private getCardTextLines(channel: HTMLElement, title?: string): string[] {
		const seen = new Set<string>();
		const lines: string[] = [];

		for (const element of channel.querySelectorAll<HTMLElement>("p, span")) {
			const text = element.textContent?.trim();
			if (!text || text === title || seen.has(text)) continue;
			seen.add(text);
			lines.push(text);
		}

		return lines;
	}

	private isStatusText(text: string): boolean {
		return /\d/.test(text);
	}

	private normalize(value: string) {
		return value.trim().toLowerCase();
	}
}

function FollowedChannelsSearchComponent({ initialValue, onSearch, results }: FollowedChannelsSearchComponentProps) {
	const [value, setValue] = useState(initialValue);
	const placeholder = "Search followed channels";

	return (
		<>
			<SearchInput
				aria-label={placeholder}
				placeholder={placeholder}
				type="search"
				value={value}
				onInput={(event) => {
					const nextValue = event.currentTarget.value;
					setValue(nextValue);
					onSearch(nextValue);
				}}
			/>
			{value.trim().length > 0 && results.value.length > 0 && (
				<div className="enhancer-followed-channels-search-results">
					{results.value.map((result) => (
						<a className="enhancer-followed-channels-search-result" href={result.href} key={result.href}>
							{result.avatarUrl && <img alt="" src={result.avatarUrl} />}
							<span className="enhancer-followed-channels-search-result-main">
								<span className="enhancer-followed-channels-search-result-name">{result.name}</span>
								{result.game && <span className="enhancer-followed-channels-search-result-game">{result.game}</span>}
							</span>
							{result.status && (
								<span className="enhancer-followed-channels-search-result-side">
									<span className="enhancer-followed-channels-search-result-live-dot" />
									<span className="enhancer-followed-channels-search-result-status">{result.status}</span>
								</span>
							)}
						</a>
					))}
				</div>
			)}
		</>
	);
}

const SearchInput = styled.input`
	&::-webkit-search-cancel-button {
		cursor: pointer;
	}
`;
