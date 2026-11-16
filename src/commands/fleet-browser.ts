import {
  ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle, CheckboxBuilder,
  CommandInteraction, ComponentType, ContainerBuilder, LabelBuilder, Message, MessageFlags,
  ModalBuilder, ModalSubmitInteraction,
  SectionBuilder, SeparatorBuilder, StringSelectMenuBuilder,
  StringSelectMenuInteraction, TextDisplayBuilder, TextInputBuilder, TextInputStyle,
} from "discord.js";
import { createHash } from "crypto";
import { ShipDao, Ships } from "../models/Ships";
import { findShip, getGuildUser, getUserGuilds } from "../utils";
import { escapeDiscordText, unescapeDiscordText } from "../discord-text";

const PAGE_SIZE = 9;
const INVENTORY_PAGE_SIZE = 20;
const OWNER_PAGE_SIZE = 15;
const MAX_SEARCH_LENGTH = 100;
const CARGO_THRESHOLDS = [0, 16, 32, 64, 128, 256, 512];
// Coordinate in-flight requests only. Browser state stays in the message;
// completed requests leave nothing behind or needed after a restart.
const pendingUpdates = new Map<string, {
  latest: symbol;
  count: number;
  navigation: Set<string>;
  edit: Promise<void>;
}>();

type FleetGroup = {
  name: string;
  size: string;
  role: string;
  flightReady: boolean;
  cargo?: number;
  count: number;
  loaners: string[];
  owners: Map<string, number>;
};
type BrowserSession = {
  guildId: string;
  guildName: string;
  showGuildName: boolean;
  groups: FleetGroup[];
  sizes: string[];
  query: string;
  showLoaners: boolean;
  viewerId: string;
  inventoryOwner?: string;
};
type BrowserState = {
  size: string; page: number; ship: string; flightReadyOnly: boolean; hideOwned: boolean; minCargo: number;
};
type BrowserInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
type InventoryOwner = { id: string; username?: string; globalName?: string | null };

// Stable keys prevent an inventory change from shifting a size/ship index to a
// different selection. They also keep controls within Discord's 100-character limit.
const key = (value: string) => createHash("sha256").update(value.toLowerCase()).digest("base64url").slice(0, 11);
const searchLabel = escapeDiscordText;
const unlabel = unescapeDiscordText;
const validCargo = (value: string) => CARGO_THRESHOLDS.some((threshold) => String(threshold) === value);
// Omitted options preserve existing cards; optional fields remain in their original order.
const filterSuffix = (state: BrowserState) => state.minCargo
  ? `#${Number(state.flightReadyOnly)}#${Number(state.hideOwned)}#${state.minCargo}`
  : state.hideOwned ? `#${Number(state.flightReadyOnly)}#1` : state.flightReadyOnly ? "#1" : "";

function currentCard(message: Message) {
  const card = message.components[0]?.toJSON();
  return card?.type === ComponentType.Container ? card : undefined;
}

function currentBrowserId(message: Message) {
  const footer = currentCard(message)?.components.at(-1);
  const control = footer?.type === ComponentType.ActionRow ? footer.components[0] : undefined;
  return control && "custom_id" in control ? control.custom_id.split("#")[1] : undefined;
}

function currentBrowserState(message: Message): BrowserState | undefined {
  const footer = currentCard(message)?.components.at(-1);
  if (footer?.type !== ComponentType.ActionRow) return;
  const indicator = footer.components.find((component) =>
    "custom_id" in component && component.custom_id.split("#")[2] === "page");
  if (!indicator || !("custom_id" in indicator)) return;
  const [, , , size, page, ship, ready, owned, cargo, ...extra] = indicator.custom_id.split("#");
  if (extra.length || (ready !== undefined && !["0", "1"].includes(ready)) ||
      (owned !== undefined && !["0", "1"].includes(owned)) || (cargo !== undefined && !validCargo(cargo))) return;
  return {
    size, page: Number(page), ship, flightReadyOnly: ready === "1", hideOwned: owned === "1", minCargo: Number(cargo || 0),
  };
}

function currentQuery(message: Message) {
  const card = currentCard(message);
  if (!card) return "";
  const first = card.components[0];
  const heading = first?.type === ComponentType.Section ? first.components[0] : first;
  if (heading?.type !== ComponentType.TextDisplay) return "";
  // The visible search heading carries the query across restarts; no session is stored.
  return unlabel(heading.content.match(/\n-# Search: (.*)$/)?.[1] || "");
}

const text = (content: string) => new TextDisplayBuilder().setContent(content);
const label = (value: string) => escapeDiscordText(value.slice(0, 120));

function inventoryTable(groups: FleetGroup[]) {
  // Keep catalog text inside the code block and bound wide names on narrow clients.
  const cell = (value: string, limit: number) => {
    const clean = value.replace(/`/g, "'").replace(/\s+/g, " ").trim();
    return clean.length > limit ? clean.slice(0, limit - 1) + "…" : clean;
  };
  const rows = [
    ["Qty", "Ship"],
    ...groups.map((group) => [
      group.count > 1 ? String(group.count) : "", cell(group.name, 48),
    ]),
  ];
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  const lines = rows.map((row) => row.map((value, column) =>
    column === 0 ? value.padStart(widths[column])
      : column === row.length - 1 ? value : value.padEnd(widths[column])
  ).join("  "));
  return "```\n" + lines.join("\n") + "\n```";
}

function renderBrowser(id: string, session: BrowserSession, state: BrowserState) {
  const { groups, sizes } = session;
  const query = session.query.toLowerCase();
  const available = groups.filter((group) =>
    (!state.flightReadyOnly || group.flightReady) && (!state.hideOwned || !group.owners.has(session.viewerId)) &&
    (!state.minCargo || (group.cargo ?? 0) >= state.minCargo)
  );
  const searched = available.filter((group) => group.name.toLowerCase().includes(query));
  const filtered = searched.filter((group) =>
    state.size === "-1" || key(group.size) === state.size
  );
  const selected = available.find((group) => key(group.name) === state.ship);
  const entries = selected ? [...selected.owners.entries()] : filtered;
  const pageSize = selected ? OWNER_PAGE_SIZE : session.inventoryOwner ? INVENTORY_PAGE_SIZE : PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(entries.length / pageSize));
  const page = Math.min(Math.max(0, state.page), pages - 1);
  // Keep navigation IDs stable when the message changes, so a queued click
  // still refers to a real button. The page indicator carries the current view.
  const controlId = (action: string, targetPage = page, ship = state.ship) =>
    (action === "previous" || action === "next"
      ? `fleet_browser#${id}#${action}#-1#0#-1`
      : `fleet_browser#${id}#${action}#${state.size}#${targetPage}#${ship}`) +
      filterSuffix(state);
  const button = (title: string, action: string, targetPage = page, ship = state.ship) =>
    new ButtonBuilder().setCustomId(controlId(action, targetPage, ship))
      .setLabel(title).setStyle(ButtonStyle.Secondary);
  const title = session.inventoryOwner
    ? `${label(session.inventoryOwner)} · Inventory${session.showGuildName ? `\n${label(session.guildName)}` : ""}`
    : session.showGuildName ? `${label(session.guildName)} · Fleet` : "Fleet";
  const filters = [state.flightReadyOnly && "Flight ready only", state.hideOwned && "Hide ships I own",
    state.minCargo && `Cargo: ${state.minCargo}+ SCU`]
    .filter(Boolean).join(" · ");
  const heading = text(`## ${title}${filters ? `\n-# ${filters}` : ""}${session.query ? `\n-# Search: ${searchLabel(session.query)}` : ""}`);
  const card = new ContainerBuilder().setAccentColor(0x0099ff);
  if (selected) card.addTextDisplayComponents(heading);
  else card.addSectionComponents(new SectionBuilder().addTextDisplayComponents(heading)
    .setButtonAccessory(button("Search", "search").setEmoji("🔎")));
  card.addSeparatorComponents(new SeparatorBuilder());

  if (selected) {
    card.addTextDisplayComponents(text(
      `### ${label(selected.name)}\n${label(selected.size)} · ${label(selected.role)}`
    ));
    const owners = [...selected.owners.entries()];
    card.addTextDisplayComponents(text(owners.slice(page * pageSize, (page + 1) * pageSize)
      .map(([owner, count]) => `<@${owner}> — **${count}**`).join("\n")));
  } else {
    if (sizes.length) {
      const counts = new Map<string, number>();
      let total = 0;
      for (const group of searched) {
        total += group.count;
        counts.set(group.size, (counts.get(group.size) || 0) + group.count);
      }
      const optionLabel = (name: string, count: number) => {
        const suffix = ` (${count})`;
        return name.slice(0, 100 - suffix.length) + suffix;
      };
      const menu = new StringSelectMenuBuilder().setCustomId(controlId("size"))
        .setPlaceholder("Filter by size")
        .addOptions({ label: optionLabel("All sizes", total), value: "-1", default: state.size === "-1" });
      sizes.forEach((value) => menu.addOptions({
        label: optionLabel(value, counts.get(value) || 0), value: key(value), default: state.size === key(value),
      }));
      card.addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu));
    }
    if (!filtered.length) {
      card.addTextDisplayComponents(text(groups.length
        ? session.query || state.flightReadyOnly || state.hideOwned || state.minCargo ? "No ships match these filters. Change the search or size."
        : "No ships match this size. Choose another size."
        : session.inventoryOwner ? "No ships recorded for this member in this server."
        : "No ships yet. Add a ship with `/inventory add` or import your fleet with `/import`."));
    }
    const visibleGroups = filtered.slice(page * pageSize, (page + 1) * pageSize);
    if (session.inventoryOwner && visibleGroups.length) {
      card.addTextDisplayComponents(text(inventoryTable(visibleGroups)));
    }
    for (const group of visibleGroups) {
      const loaners = session.showLoaners && group.loaners.length
        ? `\nLoaners: ${group.loaners.map(label).join(", ").slice(0, 500)}` : "";
      if (session.inventoryOwner) {
        if (loaners) card.addTextDisplayComponents(text(`**${label(group.name)}**${loaners}`));
      } else {
        const quantity = group.count > 1 ? ` × ${group.count}` : "";
        const shipText = text(`**${label(group.name)}${quantity}**${loaners}`);
        card.addSectionComponents(new SectionBuilder().addTextDisplayComponents(shipText)
          .setButtonAccessory(button("Owners", "owners", 0, key(group.name))));
      }
    }
  }

  const navigation = new ActionRowBuilder<ButtonBuilder>();
  if (selected) {
    navigation.addComponents(button(session.inventoryOwner ? "Back to inventory" : "Back to fleet", "fleet",
      Math.floor(filtered.indexOf(selected) / PAGE_SIZE), "-1"));
  }
  navigation.addComponents(
    button("Previous", "previous").setDisabled(page === 0),
    button(`Page ${page + 1} of ${pages}`, "page").setDisabled(true),
    button("Next", "next").setDisabled(page === pages - 1),
  );
  if (!selected && (session.query || state.flightReadyOnly || state.hideOwned || state.minCargo)) navigation.addComponents(button("Clear search", "clear_search"));
  card.addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(navigation);
  return { flags: MessageFlags.IsComponentsV2 as const, components: [card], allowedMentions: { parse: [] as never[] } };
}

function buildBrowser(
  guildId: string, guildName: string,
  ships: Ships[], showLoaners: boolean, viewerId: string,
  inventoryOwner?: string,
): BrowserSession {
  const grouped = new Map<string, FleetGroup>();
  for (const row of ships) {
    const ship = findShip(row.shipname);
    const name = ship?.rsiName || row.shipname;
    const key = name.toLowerCase();
    let group = grouped.get(key);
    if (!group) {
      group = {
        name, size: ship?.metrics?.sizeLabel || ship?.metrics?.size || ship?.size || "Unknown size",
        role: ship?.classificationLabel || ship?.classification || ship?.focus || "Unknown role", count: 0,
        flightReady: ship?.productionStatus === "flight-ready",
        cargo: ship?.metrics?.cargo,
        loaners: (ship?.loaners || []).map((loaner) => findShip(loaner.slug)?.rsiName || loaner.name || loaner.slug),
        owners: new Map(),
      };
      grouped.set(key, group);
    }
    group.count++;
    const owner = row.owner.discordUserId;
    group.owners.set(owner, (group.owners.get(owner) || 0) + 1);
  }
  const groups = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  return {
    guildId, guildName, groups, showLoaners, viewerId, query: "", showGuildName: false, inventoryOwner,
    // Discord allows 25 options including the "All" option. All ships remain available in the unfiltered view.
    sizes: [...new Set(groups.map((group) => group.size))].sort().slice(0, 24),
  };
}

async function loadBrowser(
  interaction: CommandInteraction | BrowserInteraction, guildId: string, guildName: string,
  showLoaners: boolean, inventoryOwner?: InventoryOwner,
) {
  const ships = inventoryOwner
    ? await ShipDao.findShipsByOwnerId(inventoryOwner.id, guildId)
    : await ShipDao.findAll(guildId);
  const member = inventoryOwner ? await getGuildUser(inventoryOwner.id, guildId) : undefined;
  const user = inventoryOwner ? interaction.client.users.cache.get(inventoryOwner.id) : undefined;
  const ownerName = inventoryOwner
    ? member?.displayName || inventoryOwner.globalName || user?.globalName || inventoryOwner.username ||
      user?.username || ships[0]?.owner.lastKnownTag || inventoryOwner.id
    : undefined;
  const browser = buildBrowser(guildId, guildName, ships, showLoaners, interaction.user.id, ownerName);
  browser.showGuildName = interaction.guildId !== guildId;
  return browser;
}

export async function openFleetBrowser(
  message: CommandInteraction, guildId: string, guildName: string,
  showLoaners: boolean, inventoryOwner?: InventoryOwner,
) {
  // Only routing information lives in the controls. Every update reads current
  // inventory; Discord's original interaction metadata identifies the opener.
  const id = `v2:${guildId}:${inventoryOwner?.id || ""}:${showLoaners ? 1 : 0}`;
  if (!message.deferred && !message.replied) await message.deferReply();
  const browser = await loadBrowser(message, guildId, guildName, showLoaners, inventoryOwner);
  await message.editReply(renderBrowser(id, browser, {
    size: "-1", page: 0, ship: "-1", flightReadyOnly: false, hideOwned: false, minCargo: 0,
  }));
}

export async function FleetBrowserHandler(interaction: BrowserInteraction) {
  const [, id, action, size, page, ship, ready, owned, cargo, ...extra] = interaction.customId.split("#");
  const reject = (content: string) => {
    const payload = { content, flags: MessageFlags.Ephemeral as const };
    return interaction.deferred || interaction.replied
      ? interaction.followUp(payload) : interaction.reply(payload);
  };
  if ((interaction.isModalSubmit() && !interaction.isFromMessage()) || !interaction.message) {
    await reject("This control does not belong to this fleet browser.");
    return;
  }
  if (!id?.startsWith("v2:")) {
    await reject("This inventory browser is from an older version. Run /inventory org or /inventory view to open a new one.");
    return;
  }
  const [, guildId, inventoryOwnerId, loaners, ...extraContext] = id.split(":");
  const validKey = (value: string) => value === "-1" || /^[\w-]{11}$/.test(value);
  if (extra.length || extraContext.length || !/^\d{17,20}$/.test(guildId) ||
      (inventoryOwnerId && !/^\d{17,20}$/.test(inventoryOwnerId)) || !["0", "1"].includes(loaners) ||
      (ready !== undefined && !["0", "1"].includes(ready)) ||
      (owned !== undefined && !["0", "1"].includes(owned)) || (inventoryOwnerId && owned === "1") ||
      (cargo !== undefined && !validCargo(cargo)) ||
      !validKey(size) || !validKey(ship) || !Number.isSafeInteger(Number(page))) {
    await reject("Invalid fleet browser control.");
    return;
  }
  const message = interaction.message;
  const opener = message.interactionMetadata?.user;
  if (!interaction.client.user || message.author?.id !== interaction.client.user.id || !opener ||
      message.channelId !== interaction.channelId || currentBrowserId(message) !== id ||
      (interaction.guildId && interaction.guildId !== guildId)) {
    await reject("This control does not belong to this fleet browser.");
    return;
  }
  if (opener.id !== interaction.user.id) {
    await reject(`Only the person who opened this browser can change it. Run /inventory ${inventoryOwnerId ? "view" : "org"} to open your own.`);
    return;
  }
  const state: BrowserState = {
    size, page: Number(page), ship, flightReadyOnly: ready === "1", hideOwned: owned === "1", minCargo: Number(cargo || 0),
  };
  const navigating = interaction.isButton() && (action === "previous" || action === "next");
  if (navigating) {
    const shown = currentBrowserState(message);
    if (!shown || !Number.isSafeInteger(shown.page) || !validKey(shown.size) || !validKey(shown.ship)) {
      await reject("Invalid fleet browser selection.");
      return;
    }
    Object.assign(state, shown);
    state.page += action === "next" ? 1 : -1;
  }
  let query: string | undefined;
  if (interaction.isStringSelectMenu() && action === "size") {
    state.size = interaction.values[0];
    state.page = 0;
    state.ship = "-1";
  } else if (interaction.isModalSubmit() && action === "search_submit") {
    const value = interaction.fields.getTextInputValue("ship_name");
    if (value.length > MAX_SEARCH_LENGTH) {
      await reject("Search ship names using 100 characters or fewer.");
      return;
    }
    query = value.trim().replace(/\s+/g, " ");
    // Popups opened before this option was added still submit without it.
    if (interaction.fields.fields.has("flight_ready_only")) {
      state.flightReadyOnly = interaction.fields.getCheckbox("flight_ready_only");
    }
    if (!inventoryOwnerId && interaction.fields.fields.has("hide_owned")) {
      state.hideOwned = interaction.fields.getCheckbox("hide_owned");
    }
    if (interaction.fields.fields.has("min_cargo")) {
      const values = interaction.fields.getStringSelectValues("min_cargo");
      if (values.length !== 1 || !validCargo(values[0])) {
        await reject("Choose a minimum cargo option from the dropdown.");
        return;
      }
      state.minCargo = Number(values[0]);
    }
    state.page = 0;
    state.ship = "-1";
  } else if (interaction.isButton() && action === "toggle_owned" && !inventoryOwnerId) {
    // Existing cards can refresh their old button into the current layout.
    state.hideOwned = !state.hideOwned;
    state.page = 0;
    state.ship = "-1";
  } else if (interaction.isButton() && action === "clear_search") {
    query = "";
    state.flightReadyOnly = false;
    state.hideOwned = false;
    state.minCargo = 0;
    state.page = 0;
    state.ship = "-1";
  } else if (!interaction.isButton() || !["fleet", "owners", "search", "previous", "next"].includes(action)) {
    await reject("Invalid fleet browser control.");
    return;
  }
  if (!validKey(state.size) || (action === "owners" && (inventoryOwnerId || state.ship === "-1"))) {
    await reject("Invalid fleet browser selection.");
    return;
  }
  if (interaction.isButton() && action === "search") {
    const input = new TextInputBuilder().setCustomId("ship_name")
      .setStyle(TextInputStyle.Short).setPlaceholder("e.g. Cyclone")
      .setMaxLength(MAX_SEARCH_LENGTH).setRequired(false);
    const query = currentQuery(message);
    if (query) input.setValue(query);
    const modal = new ModalBuilder()
      .setCustomId(`fleet_browser#${id}#search_submit#${state.size}#0#-1${filterSuffix(state)}`)
      .setTitle("Search ships")
      .addLabelComponents(
        new LabelBuilder().setLabel("Ship name").setTextInputComponent(input),
        new LabelBuilder().setLabel("Minimum cargo (SCU)").setStringSelectMenuComponent(
          new StringSelectMenuBuilder().setCustomId("min_cargo").setMinValues(1).setMaxValues(1)
            .addOptions(CARGO_THRESHOLDS.map((threshold) => ({
              label: threshold ? `${threshold}+ SCU` : "Any", value: String(threshold), default: state.minCargo === threshold,
            })))),
        new LabelBuilder().setLabel("Flight ready only").setCheckboxComponent(
          new CheckboxBuilder().setCustomId("flight_ready_only").setDefault(state.flightReadyOnly)),
      );
    if (!inventoryOwnerId) {
      modal.addLabelComponents(new LabelBuilder().setLabel("Hide ships I own").setCheckboxComponent(
        new CheckboxBuilder().setCustomId("hide_owned").setDefault(state.hideOwned)));
    }
    // Showing a modal must be the initial response. Access is rechecked on submit
    // before applying the search or rendering any fleet results.
    await interaction.showModal(modal);
    return;
  }
  // Every click has a three-second acknowledgement deadline, independent of
  // database work, membership lookups, or Discord message-edit rate limits.
  const navigationKey = navigating
    ? `${message.id}:${state.size}:${state.ship}:${state.page}:${state.flightReadyOnly}:${state.hideOwned}:${state.minCargo}:${currentQuery(message)}` : undefined;
  const active = pendingUpdates.get(message.id);
  if (navigationKey && active?.navigation.has(navigationKey)) {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
    return;
  }
  // Register before acknowledging: acknowledgements can also finish out of order.
  const request = Symbol();
  const pending = active || { latest: request, count: 0, navigation: new Set<string>(), edit: Promise.resolve() };
  pending.latest = request;
  pending.count++;
  pendingUpdates.set(message.id, pending);
  if (navigationKey) pending.navigation.add(navigationKey);
  try {
    if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
    if (pending.latest !== request) return;
    const guild = (await getUserGuilds(interaction, guildId)).get(guildId);
    if (pending.latest !== request) return;
    if (!guild) {
      await reject("You no longer have access to this fleet.");
      return;
    }
    const browser = await loadBrowser(interaction, guildId, guild.name, loaners === "1",
      inventoryOwnerId ? { id: inventoryOwnerId } : undefined);
    if (pending.latest !== request) return;
    browser.query = query === undefined ? currentQuery(message) : query;
    // Deleted categories/ships cannot retain a positional selection. Return to
    // the current fleet and clamp the page when entries have been removed.
    if (state.size !== "-1" && !browser.sizes.some((value) => key(value) === state.size)) {
      state.size = "-1";
      state.page = 0;
    }
    if (state.ship !== "-1" && !browser.groups.some((group) =>
      key(group.name) === state.ship && (!state.flightReadyOnly || group.flightReady) &&
      (!state.hideOwned || !group.owners.has(browser.viewerId)) && (!state.minCargo || (group.cargo ?? 0) >= state.minCargo))) {
      state.ship = "-1";
      state.page = 0;
    }
    const payload = renderBrowser(id, browser, state);
    // An edit already sent to Discord cannot be recalled. Finish it before a
    // newer edit, and discard requests superseded while waiting to send.
    const edit = pending.edit.then(async () => {
      if (pending.latest === request) await interaction.editReply(payload);
    });
    pending.edit = edit.catch(() => {});
    await edit;
  } catch {
    if (pending.latest === request) {
      await reject("Couldn't update the inventory browser. Try again or run the inventory command again.");
    }
  } finally {
    if (navigationKey) pending.navigation.delete(navigationKey);
    if (--pending.count === 0) pendingUpdates.delete(message.id);
  }
}
