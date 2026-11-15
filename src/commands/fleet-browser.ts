import {
  ActionRowBuilder, ButtonBuilder, ButtonInteraction, ButtonStyle,
  CommandInteraction, ComponentType, ContainerBuilder, escapeMarkdown, LabelBuilder, Message, MessageFlags,
  ModalBuilder, ModalSubmitInteraction,
  SectionBuilder, SeparatorBuilder, StringSelectMenuBuilder,
  StringSelectMenuInteraction, TextDisplayBuilder, TextInputBuilder, TextInputStyle,
} from "discord.js";
import { createHash } from "crypto";
import { ShipDao, Ships } from "../models/Ships";
import { findShip, getGuildUser, getUserGuilds } from "../utils";

const PAGE_SIZE = 9;
const INVENTORY_PAGE_SIZE = 20;
const OWNER_PAGE_SIZE = 15;
const MAX_SEARCH_LENGTH = 100;
// Only merge duplicate page requests while their update is in flight. Nothing
// is retained after completion or needed to restore a card after a restart.
const pendingNavigation = new Set<string>();

type FleetGroup = {
  name: string;
  size: string;
  role: string;
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
  inventoryOwner?: string;
};
type BrowserState = { size: string; page: number; ship: string };
type BrowserInteraction = ButtonInteraction | StringSelectMenuInteraction | ModalSubmitInteraction;
type InventoryOwner = { id: string; username?: string; globalName?: string | null };

// Stable keys prevent an inventory change from shifting a size/ship index to a
// different selection. They also keep controls within Discord's 100-character limit.
const key = (value: string) => createHash("sha256").update(value.toLowerCase()).digest("base64url").slice(0, 11);
const searchLabel = (value: string) => value.replace(/[\\`*_~|]/g, "\\$&");
const unlabel = (value: string) => value.replace(/\\([\\`*_~|])/g, "$1");

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
  const [, , , size, page, ship] = indicator.custom_id.split("#");
  return { size, page: Number(page), ship };
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
const label = (value: string) => escapeMarkdown(value.slice(0, 120));

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
  const searched = groups.filter((group) => group.name.toLowerCase().includes(query));
  const filtered = searched.filter((group) =>
    state.size === "-1" || key(group.size) === state.size
  );
  const selected = groups.find((group) => key(group.name) === state.ship);
  const entries = selected ? [...selected.owners.entries()] : filtered;
  const pageSize = selected ? OWNER_PAGE_SIZE : session.inventoryOwner ? INVENTORY_PAGE_SIZE : PAGE_SIZE;
  const pages = Math.max(1, Math.ceil(entries.length / pageSize));
  const page = Math.min(Math.max(0, state.page), pages - 1);
  // Keep navigation IDs stable when the message changes, so a queued click
  // still refers to a real button. The page indicator carries the current view.
  const controlId = (action: string, targetPage = page, ship = state.ship) =>
    action === "previous" || action === "next"
      ? `fleet_browser#${id}#${action}#-1#0#-1`
      : `fleet_browser#${id}#${action}#${state.size}#${targetPage}#${ship}`;
  const button = (title: string, action: string, targetPage = page, ship = state.ship) =>
    new ButtonBuilder().setCustomId(controlId(action, targetPage, ship))
      .setLabel(title).setStyle(ButtonStyle.Secondary);
  const title = session.inventoryOwner
    ? `${label(session.inventoryOwner)} · Inventory${session.showGuildName ? `\n${label(session.guildName)}` : ""}`
    : session.showGuildName ? `${label(session.guildName)} · Fleet` : "Fleet";
  const heading = text(`## ${title}${session.query ? `\n-# Search: ${searchLabel(session.query)}` : ""}`);
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
        ? session.query ? "No ships match these filters. Change the search or size."
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
  if (!selected && session.query) navigation.addComponents(button("Clear search", "clear_search"));
  card.addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(navigation);
  return { flags: MessageFlags.IsComponentsV2 as const, components: [card], allowedMentions: { parse: [] as never[] } };
}

function buildBrowser(
  guildId: string, guildName: string,
  ships: Ships[], showLoaners: boolean,
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
    guildId, guildName, groups, showLoaners, query: "", showGuildName: false, inventoryOwner,
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
  const browser = buildBrowser(guildId, guildName, ships, showLoaners, ownerName);
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
  await message.editReply(renderBrowser(id, browser, { size: "-1", page: 0, ship: "-1" }));
}

export async function FleetBrowserHandler(interaction: BrowserInteraction) {
  const [, id, action, size, page, ship, ...extra] = interaction.customId.split("#");
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
  const state = { size, page: Number(page), ship };
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
    state.page = 0;
    state.ship = "-1";
  } else if (interaction.isButton() && action === "clear_search") {
    query = "";
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
      .setCustomId(`fleet_browser#${id}#search_submit#${state.size}#0#-1`)
      .setTitle("Search ships")
      .addLabelComponents(new LabelBuilder().setLabel("Ship name").setTextInputComponent(input));
    // Showing a modal must be the initial response. Access is rechecked on submit
    // before applying the search or rendering any fleet results.
    await interaction.showModal(modal);
    return;
  }
  // Every click has a three-second acknowledgement deadline, independent of
  // database work, membership lookups, or Discord message-edit rate limits.
  if (!interaction.deferred && !interaction.replied) await interaction.deferUpdate();
  const navigationKey = navigating
    ? `${message.id}:${state.size}:${state.ship}:${state.page}:${currentQuery(message)}` : undefined;
  if (navigationKey && pendingNavigation.has(navigationKey)) return;
  if (navigationKey) pendingNavigation.add(navigationKey);
  try {
    const guild = (await getUserGuilds(interaction, guildId)).get(guildId);
    if (!guild) {
      await reject("You no longer have access to this fleet.");
      return;
    }
    const browser = await loadBrowser(interaction, guildId, guild.name, loaners === "1",
      inventoryOwnerId ? { id: inventoryOwnerId } : undefined);
    browser.query = query === undefined ? currentQuery(message) : query;
    // Deleted categories/ships cannot retain a positional selection. Return to
    // the current fleet and clamp the page when entries have been removed.
    if (state.size !== "-1" && !browser.sizes.some((value) => key(value) === state.size)) {
      state.size = "-1";
      state.page = 0;
    }
    if (state.ship !== "-1" && !browser.groups.some((group) => key(group.name) === state.ship)) {
      state.ship = "-1";
      state.page = 0;
    }
    const payload = renderBrowser(id, browser, state);
    await interaction.editReply(payload);
  } catch {
    await reject("Couldn't update the inventory browser. Try again or run the inventory command again.");
  } finally {
    if (navigationKey) pendingNavigation.delete(navigationKey);
  }
}
