const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");
const { ComponentType, MessageFlags } = require("discord.js");
const GUILD = "10000000000000000001";
const OWNER = "100000000000000000";

function loadModule(name, stubs) {
  const target = require.resolve(name);
  delete require.cache[target];
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === target && Object.hasOwn(stubs, request)) return stubs[request];
    return original.apply(this, arguments);
  };
  try { return require(target); } finally { Module._load = original; }
}

function components(payload) {
  const walk = (item) => [item, ...(item.components || []).flatMap(walk), ...(item.accessory ? walk(item.accessory) : [])];
  return payload.components.flatMap((item) => walk(item.toJSON()));
}
const contents = (payload) => components(payload).map((item) => item.content || "").join("\n");
const button = (payload, title) => components(payload).find((item) => item.type === ComponentType.Button && item.label === title);
const pageLabel = (payload) => components(payload).find((item) => item.type === ComponentType.Button && item.label.startsWith("Page ")).label;
const menu = (payload, kind) => components(payload).find((item) => item.type === ComponentType.StringSelect && item.custom_id.split("#")[2] === kind);
const sizeOption = (payload, name) => menu(payload, "size").options.find((option) => option.label.startsWith(`${name} (`));
const fleetRows = (payload) => components(payload).filter((item) =>
  item.type === ComponentType.Section && item.accessory?.custom_id?.split("#")[2] === "owners");

function fixture(shipDao) {
  let access = true;
  let accessChecks = 0;
  let currentShips = [];
  let ownerName;
  let inventoryFailure;
  const productionStatuses = new Map();
  const cargoCapacities = new Map();
  const inventoryQueries = [];
  const client = { user: { id: "bot" }, users: { cache: new Map() } };
  const utils = {
    findShip: (name) => {
      if (name === "unknown") return undefined;
      const index = name === "alias" ? 0 : Number(name.slice(-2));
      return {
        rsiName: `Ship ${String(index).padStart(2, "0")}`,
        metrics: { sizeLabel: index % 2 ? "Small" : "Large",
          cargo: cargoCapacities.has(index) ? cargoCapacities.get(index) : index * 16 },
        classification: "raw-role",
        classificationLabel: index % 3 ? "Industrial" : "Combat",
        productionStatus: productionStatuses.has(index) ? productionStatuses.get(index)
          : index % 2 ? "in-concept" : "flight-ready",
        loaners: index === 0 ? [{ slug: "Ship 01" }] : [],
      };
    },
    getGuildUser: async () => ownerName ? { displayName: ownerName } : undefined,
    getUserGuilds: async (interaction, guildId) => {
      accessChecks++;
      assert.equal(guildId, GUILD);
      if (!interaction.inCachedGuild()) assert.equal(interaction.deferred, true);
      return new Map(access ? [[GUILD, { name: "Fixture org" }]] : []);
    },
  };
  const dao = {
    findAll: async (guildId) => {
      inventoryQueries.push(["org", guildId]);
      if (inventoryFailure) throw inventoryFailure;
      return shipDao ? shipDao.findAll(guildId) : currentShips;
    },
    findShipsByOwnerId: async (ownerId, guildId) => {
      inventoryQueries.push(["view", ownerId, guildId]);
      if (inventoryFailure) throw inventoryFailure;
      return shipDao ? shipDao.findShipsByOwnerId(ownerId, guildId) : currentShips;
    },
  };
  const loadBrowser = () => loadModule("../built/commands/fleet-browser", {
    "../utils": utils,
    "../models/Ships": { ShipDao: dao },
  });
  let browser = loadBrowser();
  const row = (shipname, owner = "100000000000000000") => ({ shipname, owner: { discordUserId: owner } });
  const ships = [
    ...Array.from({ length: 17 }, (_, index) => row("Ship 00", String(100000000000000000n + BigInt(index)))),
    row("alias"),
    ...Array.from({ length: 7 }, (_, index) => row(`Ship 0${index + 1}`)),
    row("unknown"),
  ];
  const rendered = [];
  const replies = [];
  const modals = [];
  const command = {
    user: { id: "initiator" }, deferred: true, client,
    editReply: async (payload) => { rendered.push(payload); return { id: "message" }; },
  };
  const click = async (control, values, overrides = {}) => {
    const events = [];
    await browser.FleetBrowserHandler({
      customId: control.custom_id, user: { id: "initiator" }, guildId: GUILD, channelId: "channel",
      message: {
        id: "message", channelId: "channel", author: { id: "bot" },
        interactionMetadata: { user: { id: "initiator" } }, components: rendered.at(-1)?.components,
      }, values,
      client,
      inCachedGuild: () => true,
      isButton: () => !values, isStringSelectMenu: () => !!values, isModalSubmit: () => false,
      async showModal(modal) { modals.push(modal.toJSON()); events.push("modal"); },
      async reply(payload) { this.replied = true; replies.push(payload); events.push("reply"); },
      async deferUpdate() { this.deferred = true; events.push("defer"); },
      async update(payload) { this.replied = true; rendered.push(payload); events.push("update"); },
      editReply: async (payload) => { rendered.push(payload); events.push("edit"); },
      followUp: async (payload) => { replies.push(payload); events.push("followUp"); },
      ...overrides,
    });
    return events;
  };
  return {
    ...browser, ships, command, rendered, replies, modals, click,
    get browser() { return browser; },
    openFleetBrowser: (command, guildId, guildName, ships, showLoaners, owner) => {
      currentShips = ships;
      const member = typeof owner === "string" ? { id: OWNER, name: owner } : owner;
      ownerName = member?.name;
      if (member) client.users.cache.set(member.id, { username: member.name });
      return browser.openFleetBrowser(command, guildId, guildName, showLoaners,
        member ? { id: member.id, username: member.name } : undefined);
    },
    restart: () => { browser = loadBrowser(); },
    inventoryQueries,
    setShips: (ships) => { currentShips = ships; },
    failInventory: (error) => { inventoryFailure = error; },
    setMemberName: (name) => { ownerName = name; },
    submit: (modal, query, overrides = {}, flightReadyOnly = false, hideOwned = false, minCargo = 0) => click(modal, undefined, {
      isButton: () => false, isModalSubmit: () => true, isFromMessage: () => true,
      fields: {
        fields: new Map([
          ["flight_ready_only", { value: flightReadyOnly }],
          ...(modal.components.some((label) => label.component.custom_id === "hide_owned")
            ? [["hide_owned", { value: hideOwned }]] : []),
          ...(modal.components.some((label) => label.component.custom_id === "min_cargo")
            ? [["min_cargo", { values: [String(minCargo)] }]] : []),
        ]),
        getTextInputValue: (id) => { assert.equal(id, "ship_name"); return query; },
        getStringSelectValues: (id) => { assert.equal(id, "min_cargo"); return [String(minCargo)]; },
        getCheckbox: (id) => {
          assert.ok(["flight_ready_only", "hide_owned"].includes(id));
          return id === "flight_ready_only" ? flightReadyOnly : hideOwned;
        },
      },
      ...overrides,
    }),
    setProductionStatus: (name, value) => productionStatuses.set(Number(name.slice(-2)), value),
    setCargo: (name, value) => cargoCapacities.set(Number(name.slice(-2)), value),
    setAccess: (value) => { access = value; },
    get accessChecks() { return accessChecks; },
  };
}

test("org inventory opens a guild-scoped browser with the existing loaner option", async () => {
  const f = fixture();
  f.setShips(f.ships);
  const { InventoryCommand } = loadModule("../built/commands/InventoryCommand", {
    "../utils": { getGuildId: async () => GUILD },
    "../handlers/DiscordHandlers": { client: { guilds: { cache: new Map([[GUILD, { name: "Fixture org" }]]) } } },
    "./fleet-browser": f.browser,
  });
  await InventoryCommand({ ...f.command, isChatInputCommand: () => true,
    options: { getSubcommand: () => "org", getBoolean: () => true } });
  assert.deepEqual(f.inventoryQueries, [["org", GUILD]]);
  assert.match(contents(f.rendered.at(-1)), /Fixture org · Fleet/);
  assert.match(contents(f.rendered.at(-1)), /Loaners: Ship 01/);
});

test("personal inventory opens and refreshes only the requested member with consistent display names", async () => {
  const f = fixture();
  const { InventoryCommand } = loadModule("../built/commands/InventoryCommand", {
    "../utils": { getGuildId: async () => GUILD },
    "../handlers/DiscordHandlers": { client: { guilds: { cache: new Map([[GUILD, { name: "Fixture org" }]]) } } },
    "./fleet-browser": f.browser,
  });
  const other = { id: "100000000000000099", username: "Other username", globalName: "Other member" };
  const command = { ...f.command, isChatInputCommand: () => true,
    user: { id: OWNER, username: "My username" } };
  f.setMemberName("My nickname");
  await InventoryCommand({ ...command, options: {
    getSubcommand: () => "view", getBoolean: () => false, getUser: () => null,
  } });
  assert.deepEqual(f.inventoryQueries.at(-1), ["view", OWNER, GUILD]);
  assert.match(contents(f.rendered.at(-1)), /My nickname · Inventory/);
  await f.click(button(f.rendered.at(-1), "Search"));
  await f.submit(f.modals.at(-1), "");
  assert.match(contents(f.rendered.at(-1)), /My nickname · Inventory/);

  f.setMemberName(undefined);
  f.command.client.users.cache.set(other.id, other);
  await InventoryCommand({ ...command, options: {
    getSubcommand: () => "view", getBoolean: () => true, getUser: () => other,
  } });
  assert.match(contents(f.rendered.at(-1)), /Other member · Inventory/);
  await f.click(button(f.rendered.at(-1), "Search"));
  f.restart();
  await f.submit(f.modals.at(-1), "");
  assert.match(contents(f.rendered.at(-1)), /Other member · Inventory/);
  assert.deepEqual(f.inventoryQueries, [
    ["view", OWNER, GUILD], ["view", OWNER, GUILD],
    ["view", other.id, GUILD], ["view", other.id, GUILD],
  ]);
});

test("personal inventory table preserves quantities, filters, and loaners across 20-row pages", async () => {
  const f = fixture();
  const ships = [
    ...f.ships.filter((ship) => ship.owner.discordUserId === "100000000000000000"),
    ...Array.from({ length: 16 }, (_, index) => ({
      shipname: `Ship ${String(index + 8).padStart(2, "0")}`,
      owner: { discordUserId: "100000000000000000" },
    })),
  ];
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, true, "Member name");
  let payload = f.rendered.at(-1);
  assert.match(contents(payload), /Member name · Inventory\nFixture org/);
  assert.doesNotMatch(contents(payload), /UEC/);
  assert.match(contents(payload), /Loaners: Ship 01/);
  const table = components(payload).find((item) => item.content?.startsWith("```\n")).content;
  assert.match(table, /Qty\s+Ship/);
  assert.match(table, /\n +2 +Ship 00\n/);
  assert.match(table, /\n +Ship 01\n/);
  assert.equal(table.split("\n").slice(2, -1).length, 20);
  assert.equal(button(payload, "Owners"), undefined);
  assert.doesNotMatch(contents(payload), /\bowners?\b/i);
  await f.click(button(payload, "Next"));
  payload = f.rendered.at(-1);
  assert.match(contents(payload), /Member name · Inventory/);
  assert.equal(pageLabel(payload), "Page 2 of 2");
  assert.match(contents(payload), /unknown/);
  assert.equal(button(payload, "Owners"), undefined);
  assert.doesNotMatch(contents(payload), /\bowners?\b/i);
  assert.equal(menu(payload, "role"), undefined);
  await f.click(menu(payload, "size"), [sizeOption(payload, "Large").value]);
  payload = f.rendered.at(-1);
  assert.equal(pageLabel(payload), "Page 1 of 1");
  assert.doesNotMatch(components(payload).find((item) => item.content?.startsWith("```\n")).content, /Ship 01/);
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", [], false, "Empty member");
  assert.match(contents(f.rendered.at(-1)), /Empty member · Inventory/);
  assert.match(contents(f.rendered.at(-1)), /No ships recorded for this member in this server/);
  f.command.guildId = GUILD;
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false, "Member name");
  assert.match(contents(f.rendered.at(-1)), /Member name · Inventory/);
  assert.doesNotMatch(contents(f.rendered.at(-1)), /Fixture org/);
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false);
  assert.doesNotMatch(contents(f.rendered.at(-1)), /Fixture org/);
});

test("fleet pages preserve quantities, filter by size, and paginate owners without pinging", async () => {
  const f = fixture();
  const ships = [
    ...f.ships,
    ...Array.from({ length: 4 }, (_, index) => ({
      shipname: `Ship ${String(index + 8).padStart(2, "0")}`,
      owner: { discordUserId: "100000000000000000" },
    })),
  ];
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, true);
  let payload = f.rendered.at(-1);
  assert.equal(payload.flags, MessageFlags.IsComponentsV2);
  assert.deepEqual(payload.allowedMentions, { parse: [] });
  assert.match(contents(payload), /Ship 00 × 18/);
  assert.match(contents(payload), /\*\*Ship 01\*\*/);
  assert.doesNotMatch(contents(payload), /× 1\*\*/);
  assert.ok(button(payload, "Owners"));
  assert.doesNotMatch(contents(payload), /\bowners?\b/i);
  assert.match(contents(payload), /Loaners: Ship 01/);
  assert.equal(fleetRows(payload).length, 9);
  assert.ok(components(payload).length <= 40);
  assert.equal(button(payload, "Previous").disabled, true);
  assert.deepEqual(await f.click(button(payload, "Next")), ["defer", "edit"]);
  payload = f.rendered.at(-1);
  assert.match(contents(payload), /unknown/);
  assert.equal(pageLabel(payload), "Page 2 of 2");
  assert.equal(button(payload, "Next").disabled, true);

  await f.click(menu(payload, "size"), [sizeOption(payload, "Large").value]);
  payload = f.rendered.at(-1);
  assert.equal(fleetRows(payload).length, 6);
  assert.equal(pageLabel(payload), "Page 1 of 1");
  assert.equal(menu(payload, "role"), undefined);
  assert.doesNotMatch(contents(payload), /\*\*Ship 01\*\*/);

  await f.click(button(payload, "Owners"));
  payload = f.rendered.at(-1);
  assert.match(contents(payload), /<@100000000000000000> — \*\*2\*\*/);
  assert.equal(pageLabel(payload), "Page 1 of 2");
  await f.click(button(payload, "Next"));
  payload = f.rendered.at(-1);
  assert.match(contents(payload), /<@100000000000000016>/);
  assert.doesNotMatch(contents(payload), /<@100000000000000000>/);
  assert.equal(pageLabel(payload), "Page 2 of 2");
  await f.click(button(payload, "Back to fleet"));
  assert.ok(button(f.rendered.at(-1), "Owners"));
});

test("navigation IDs remain valid after page updates and use the displayed page", async () => {
  const f = fixture();
  const ships = [...f.ships, ...Array.from({ length: 16 }, (_, index) => ({
    shipname: `Ship ${String(index + 8).padStart(2, "0")}`, owner: { discordUserId: OWNER },
  }))];
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false);
  const next = button(f.rendered.at(-1), "Next");
  await f.click(next);
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 2 of 3");
  assert.equal(button(f.rendered.at(-1), "Next").custom_id, next.custom_id,
    "a click queued by Discord must still identify a control on the updated message");
  f.restart();
  await f.click(next);
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 3 of 3");
  await f.click(button(f.rendered.at(-1), "Previous"));
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 2 of 3");
  const legacy = next.custom_id.split("#");
  legacy[2] = "fleet";
  legacy[4] = "0";
  f.restart();
  await f.click({ custom_id: legacy.join("#") });
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 1 of 3", "existing cards can refresh their older navigation controls");
});

test("paging acknowledges each rapid click before inventory IO and merges identical pending targets", async () => {
  let ships;
  let readGate = Promise.resolve();
  const f = fixture({ findAll: async () => { await readGate; return ships; } });
  ships = [...f.ships, { shipname: "Ship 08", owner: { discordUserId: OWNER } }];
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false);
  const next = button(f.rendered.at(-1), "Next");
  let release;
  readGate = new Promise((resolve) => { release = resolve; });
  let acknowledgements = 0;
  const before = f.inventoryQueries.length;
  const pending = Promise.all(Array.from({ length: 8 }, () => f.click(next, undefined, {
    async deferUpdate() { this.deferred = true; acknowledgements++; },
  })));
  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.equal(acknowledgements, 8, "database work must not delay a click's initial response");
    assert.equal(f.inventoryQueries.length - before, 1, "repeat clicks on the same target need only one live read");
  } finally { release(); await pending; }
  assert.equal(f.rendered.length, 2);
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 2 of 2");
  assert.deepEqual(f.replies, []);
});

test("an older page read cannot reset newer search filters", { timeout: 5000 }, async () => {
  let ships, pauseNextRead = false, releaseRead, readStarted;
  const readGate = new Promise((resolve) => { releaseRead = resolve; });
  const started = new Promise((resolve) => { readStarted = resolve; });
  const f = fixture({ findAll: async () => {
    if (pauseNextRead) { pauseNextRead = false; readStarted(); await readGate; }
    return ships;
  } });
  ships = [...f.ships, ...Array.from({ length: 20 }, (_, index) => ({
    shipname: `Ship ${String(index + 8).padStart(2, "0")}`, owner: { discordUserId: OWNER },
  }))];
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false);
  await f.click(button(f.rendered.at(-1), "Search"));
  pauseNextRead = true;
  const olderPage = f.click(button(f.rendered.at(-1), "Next"));
  await started;
  let newest;
  try {
    await f.submit(f.modals.at(-1), "", {}, true, true, 64);
    newest = f.rendered.at(-1);
    assert.match(contents(newest), /Flight ready only · Hide ships I own · Cargo: 64\+ SCU/);
  } finally { releaseRead(); await olderPage; }
  assert.equal(f.rendered.at(-1), newest, "the older page must not replace the newer filter result");
  await f.click(button(newest, "Next"));
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 2 of 2");
  assert.match(contents(f.rendered.at(-1)), /Flight ready only · Hide ships I own · Cargo: 64\+ SCU/);
  assert.deepEqual(f.replies, []);
});

test("newer filters finish after a page edit that is already in flight", { timeout: 5000 }, async () => {
  const f = fixture();
  const ships = [...f.ships, ...Array.from({ length: 20 }, (_, index) => ({
    shipname: `Ship ${String(index + 8).padStart(2, "0")}`, owner: { discordUserId: OWNER },
  }))];
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false);
  await f.click(button(f.rendered.at(-1), "Search"));
  let releaseEdit, editStarted;
  const editGate = new Promise((resolve) => { releaseEdit = resolve; });
  const started = new Promise((resolve) => { editStarted = resolve; });
  const olderPage = f.click(button(f.rendered.at(-1), "Next"), undefined, {
    editReply: async (payload) => { editStarted(); await editGate; f.rendered.push(payload); },
  });
  await started;
  const newerFilters = f.submit(f.modals.at(-1), "", {}, true, true, 64);
  try { await new Promise((resolve) => setImmediate(resolve)); }
  finally { releaseEdit(); await Promise.all([olderPage, newerFilters]); }
  assert.match(contents(f.rendered.at(-1)), /Flight ready only · Hide ships I own · Cargo: 64\+ SCU/);
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 1 of 2");
  assert.deepEqual(f.replies, []);
});

test("fleet controls enforce ownership and access without expiring after restarts", async () => {
  const f = fixture();
  f.ships.push({ ...f.ships.at(-1), shipname: "Ship 08" });
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", f.ships, false);
  const control = button(f.rendered.at(-1), "Next");
  await f.click(control, undefined, { user: { id: "other" } });
  await f.click(control, undefined, { message: { id: "copied" } });
  await f.click(control, undefined, { guildId: "another-guild" });
  await f.click(control, undefined, { channelId: "another-channel" });
  await f.click({ custom_id: control.custom_id.replace(`v2:${GUILD}::0`, `v2:${GUILD}:${OWNER}:0`) });
  assert.equal(f.accessChecks, 0);
  assert.equal(f.rendered.length, 1);
  assert.ok(f.replies.every((reply) => reply.flags === MessageFlags.Ephemeral));
  f.setAccess(false);
  assert.deepEqual(await f.click(control), ["defer", "followUp"]);
  assert.match(f.replies.at(-1).content, /no longer have access/);
  assert.equal(f.rendered.length, 1);
  const now = Date.now;
  try {
    f.setAccess(true);
    const future = now() + 16 * 60_000;
    Date.now = () => future;
    await f.click(control);
    assert.equal(pageLabel(f.rendered.at(-1)), "Page 2 of 2");
  } finally { Date.now = now; }
});

test("obsolete controls receive a private refresh notice and leave the message intact", async () => {
  const f = fixture();
  let deleted = false;
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", f.ships, false);
  await f.click({ custom_id: "fleet_browser#old-session#fleet#-1#1#-1" }, undefined, {
    message: { id: "old-message", delete: async () => { deleted = true; } },
  });
  assert.equal(f.replies.at(-1).flags, MessageFlags.Ephemeral);
  assert.match(f.replies.at(-1).content, /older version.*\/inventory org.*\/inventory view/);
  assert.equal(deleted, false);
  assert.equal(f.rendered.length, 1);
  assert.deepEqual(f.inventoryQueries, [["org", GUILD]]);
});

test("DM paging acknowledges before membership lookup and rejects lost access privately", async () => {
  const f = fixture();
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", f.ships, false);
  const control = button(f.rendered.at(-1), "Owners");
  const dm = { guildId: null, inCachedGuild: () => false };
  assert.deepEqual(await f.click(control, undefined, dm), ["defer", "edit"]);
  assert.match(contents(f.rendered.at(-1)), /<@100000000000000000> — \*\*2\*\*/);
  const renderedCount = f.rendered.length;
  f.setAccess(false);
  assert.deepEqual(await f.click(control, undefined, dm), ["defer", "followUp"]);
  assert.equal(f.rendered.length, renderedCount);
  assert.equal(f.replies.at(-1).flags, MessageFlags.Ephemeral);
  assert.match(f.replies.at(-1).content, /no longer have access/);
});

test("empty fleets and clearing the size filter remain usable", async () => {
  const f = fixture();
  await f.openFleetBrowser(f.command, GUILD, "Empty org", [], false);
  assert.match(contents(f.rendered.at(-1)), /No ships yet/);
  assert.equal(button(f.rendered.at(-1), "Next").disabled, true);
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", f.ships, false);
  let payload = f.rendered.at(-1);
  await f.click(menu(payload, "size"), [sizeOption(payload, "Small").value]);
  payload = f.rendered.at(-1);
  assert.equal(fleetRows(payload).length, 4);
  await f.click(menu(payload, "size"), ["-1"]);
  assert.equal(fleetRows(f.rendered.at(-1)).length, 9);
});

test("fleet search filters all pages, combines with size, and survives owner navigation", async () => {
  const f = fixture();
  const ships = [...f.ships, ...Array.from({ length: 16 }, (_, index) => ({
    shipname: `Ship ${String(index + 8).padStart(2, "0")}`,
    owner: { discordUserId: "100000000000000000" },
  }))];
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false);
  await f.click(button(f.rendered.at(-1), "Next"));
  assert.deepEqual(await f.click(button(f.rendered.at(-1), "Search")), ["modal"]);
  assert.equal(f.rendered.length, 2, "opening a search must not change the fleet");
  await f.submit(f.modals.at(-1), "  sHiP  ");
  let payload = f.rendered.at(-1);
  assert.equal(pageLabel(payload), "Page 1 of 3");
  assert.match(contents(payload), /Search:.*sHiP/);
  assert.ok(button(payload, "Clear search"));
  assert.ok(components(payload).length <= 40, "search must fit Discord's component limit on full pages");
  await f.click(button(payload, "Owners"));
  await f.click(button(f.rendered.at(-1), "Next"));
  await f.click(button(f.rendered.at(-1), "Back to fleet"));
  assert.match(contents(f.rendered.at(-1)), /Search:.*sHiP/);
  await f.click(button(f.rendered.at(-1), "Next"));
  await f.click(button(f.rendered.at(-1), "Next"));
  payload = f.rendered.at(-1);
  assert.equal(pageLabel(payload), "Page 3 of 3");
  assert.match(contents(payload), /\*\*Ship 23\*\*/);
  assert.doesNotMatch(contents(payload), /\*\*unknown\*\*/);

  await f.click(menu(payload, "size"), [sizeOption(payload, "Small").value]);
  payload = f.rendered.at(-1);
  assert.equal(pageLabel(payload), "Page 1 of 2");
  await f.click(button(payload, "Search"));
  assert.equal(f.modals.at(-1).components[0].component.value, "sHiP");
  await f.submit(f.modals.at(-1), "IP 2");
  payload = f.rendered.at(-1);
  assert.equal(pageLabel(payload), "Page 1 of 1");
  assert.equal(fleetRows(payload).length, 2);
  assert.match(contents(payload), /\*\*Ship 21\*\*/);
  assert.match(contents(payload), /\*\*Ship 23\*\*/);
  assert.doesNotMatch(contents(payload), /\*\*Ship 22\*\*/);
  await f.click(button(payload, "Clear search"));
  payload = f.rendered.at(-1);
  assert.equal(pageLabel(payload), "Page 1 of 2");
  assert.equal(menu(payload, "size").options.find((option) => option.default).value, sizeOption(payload, "Small").value);
  assert.doesNotMatch(contents(payload), /Search:/);
  assert.equal(button(payload, "Clear search"), undefined);
  await f.click(button(payload, "Search"));
  await f.submit(f.modals.at(-1), "not a recorded ship");
  payload = f.rendered.at(-1);
  assert.match(contents(payload), /No ships match/);
  assert.ok(button(payload, "Clear search"));
  assert.equal(button(payload, "Next").disabled, true);
});

test("flight-ready search combines with size and survives paging, owner views, and restarts", async () => {
  const f = fixture();
  const ships = [...f.ships, ...Array.from({ length: 20 }, (_, index) => ({
    shipname: `Ship ${String(index + 8).padStart(2, "0")}`, owner: { discordUserId: OWNER },
  }))];
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false);
  await f.click(button(f.rendered.at(-1), "Search"));
  const checkbox = (modal) => modal.components.find((label) => label.component.custom_id === "flight_ready_only").component;
  assert.equal(checkbox(f.modals.at(-1)).default, false);
  await f.submit(f.modals.at(-1), "", {}, true);
  let payload = f.rendered.at(-1);
  assert.match(contents(payload), /Flight ready only/);
  assert.doesNotMatch(contents(payload), /\*\*Ship 01\*\*|\*\*unknown\*\*/);
  assert.equal(pageLabel(payload), "Page 1 of 2");
  assert.deepEqual(menu(payload, "size").options.map((option) => option.label),
    ["All sizes (31)", "Large (31)", "Small (0)", "Unknown size (0)"]);
  const next = button(payload, "Next");
  await f.click(next);
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 2 of 2");
  f.restart();
  await f.click(button(f.rendered.at(-1), "Previous"));
  assert.equal(button(f.rendered.at(-1), "Next").custom_id, next.custom_id);
  assert.match(contents(f.rendered.at(-1)), /Flight ready only/);
  await f.click(button(f.rendered.at(-1), "Owners"));
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 1 of 2");
  f.restart();
  await f.click(button(f.rendered.at(-1), "Next"));
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 2 of 2");
  await f.click(button(f.rendered.at(-1), "Back to fleet"));
  await f.click(button(f.rendered.at(-1), "Search"));
  assert.equal(checkbox(f.modals.at(-1)).default, true);
  await f.submit(f.modals.at(-1), "Ship 0", {}, true);
  payload = f.rendered.at(-1);
  assert.equal(fleetRows(payload).length, 5);
  assert.equal(menu(payload, "size").options[0].label, "All sizes (22)");
  await f.click(menu(payload, "size"), [sizeOption(payload, "Large").value]);
  await f.click(button(f.rendered.at(-1), "Owners"));
  f.setProductionStatus("Ship 00", "in-concept");
  f.restart();
  await f.click(button(f.rendered.at(-1), "Next"));
  payload = f.rendered.at(-1);
  assert.equal(fleetRows(payload).length, 4, "a ship whose status changed must leave the flight-ready owner view");
  assert.match(contents(payload), /Flight ready only\n-# Search: Ship 0/);
  assert.doesNotMatch(contents(payload), /Ship 00/);
  await f.click(button(payload, "Search"));
  assert.equal(f.modals.at(-1).components[0].component.value, "Ship 0");
  assert.equal(checkbox(f.modals.at(-1)).default, true);
  await f.submit(f.modals.at(-1), "Ship 0");
  payload = f.rendered.at(-1);
  assert.doesNotMatch(contents(payload), /Flight ready only/);
  assert.match(contents(payload), /Ship 00/);
  assert.equal(menu(payload, "size").options.find((option) => option.default).label, "Large (22)");
  assert.deepEqual(f.replies, []);
});

test("minimum cargo persists through fleet paging, owner views, and current catalog changes", async () => {
  const f = fixture();
  const ships = [...f.ships, ...Array.from({ length: 20 }, (_, index) => ({
    shipname: `Ship ${String(index + 8).padStart(2, "0")}`, owner: { discordUserId: OWNER },
  })), { shipname: "Ship 04", owner: { discordUserId: "other" } },
  { shipname: "Ship 10", owner: { discordUserId: "initiator" } }];
  f.setCargo("Ship 03", 63.9);
  f.setCargo("Ship 05", undefined);
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false);
  await f.click(button(f.rendered.at(-1), "Search"));
  const cargoMenu = (modal) => modal.components.find((label) => label.component.custom_id === "min_cargo").component;
  assert.deepEqual(cargoMenu(f.modals.at(-1)).options.map((option) => option.label),
    ["Any", "16+ SCU", "32+ SCU", "64+ SCU", "128+ SCU", "256+ SCU", "512+ SCU"]);
  assert.equal(cargoMenu(f.modals.at(-1)).options.find((option) => option.default).value, "0");
  await f.submit(f.modals.at(-1), "", {}, false, false, 64);
  let payload = f.rendered.at(-1);
  assert.match(contents(payload), /Cargo: 64\+ SCU/);
  assert.match(contents(payload), /\*\*Ship 04 × 2\*\*/);
  assert.doesNotMatch(contents(payload), /Ship 00|Ship 03|Ship 05|unknown/);
  assert.equal(menu(payload, "size").options[0].label, "All sizes (25)");
  assert.equal(pageLabel(payload), "Page 1 of 3");
  await f.click(button(payload, "Next"));
  f.restart();
  await f.click(button(f.rendered.at(-1), "Previous"));
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 1 of 3");
  await f.click(button(f.rendered.at(-1), "Owners"));
  assert.match(contents(f.rendered.at(-1)), /Ship 04/);
  f.setCargo("Ship 04", 32);
  f.restart();
  await f.click(button(f.rendered.at(-1), "Next"));
  payload = f.rendered.at(-1);
  assert.ok(button(payload, "Search"), "a changed capacity must return to the matching fleet results");
  assert.doesNotMatch(contents(payload), /Ship 04/);
  await f.click(button(payload, "Search"));
  assert.equal(cargoMenu(f.modals.at(-1)).options.find((option) => option.default).value, "64");
  await f.submit(f.modals.at(-1), "Ship 1", {}, true, true, 64);
  payload = f.rendered.at(-1);
  assert.match(contents(payload), /Flight ready only · Hide ships I own · Cargo: 64\+ SCU/);
  assert.equal(fleetRows(payload).length, 4);
  assert.doesNotMatch(contents(payload), /Ship 10|Ship 11/);
  await f.click(menu(payload, "size"), [sizeOption(payload, "Large").value]);
  assert.equal(fleetRows(f.rendered.at(-1)).length, 4);
  await f.click(button(f.rendered.at(-1), "Clear search"));
  payload = f.rendered.at(-1);
  assert.doesNotMatch(contents(payload), /Cargo:|Flight ready only|Hide ships I own|Search:/);
  assert.match(contents(payload), /Ship 00/);
  assert.equal(button(payload, "Clear search"), undefined);
  assert.deepEqual(f.replies, []);
});

test("personal cargo search uses per-ship capacity, accepts older popups, and validates selections", async () => {
  const f = fixture();
  f.setCargo("Ship 00", 16);
  const ships = f.ships.filter((ship) => ship.owner.discordUserId === OWNER);
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false, "Member");
  await f.click(button(f.rendered.at(-1), "Search"));
  const modal = f.modals.at(-1);
  const legacy = { ...modal, components: modal.components.filter((label) => label.component.custom_id !== "min_cargo") };
  f.restart();
  await f.submit(legacy, "Ship 0");
  assert.match(contents(f.rendered.at(-1)), /Ship 00/);
  await f.click(button(f.rendered.at(-1), "Search"));
  await f.submit(f.modals.at(-1), "", {}, false, false, 32);
  let payload = f.rendered.at(-1);
  assert.match(contents(payload), /Ship 02/);
  assert.doesNotMatch(contents(payload), /Ship 00|Ship 01|unknown/);
  await f.click(button(payload, "Search"));
  const renderedCount = f.rendered.length;
  await f.submit(f.modals.at(-1), "", {}, false, false, "invalid");
  assert.equal(f.rendered.length, renderedCount);
  assert.match(f.replies.at(-1).content, /Choose a minimum cargo option/);
  assert.equal(f.replies.at(-1).flags, MessageFlags.Ephemeral);
  await f.submit(f.modals.at(-1), "");
  payload = f.rendered.at(-1);
  assert.match(contents(payload), /Ship 00/);
  assert.match(contents(payload), /unknown/);
  assert.doesNotMatch(contents(payload), /Cargo:/);
});

test("org search hides owned models across aliases, shared ownership, navigation, and live inventory updates", async () => {
  const f = fixture();
  const ships = [
    ...f.ships,
    { shipname: "alias", owner: { discordUserId: "initiator" } },
    { shipname: "Ship 01", owner: { discordUserId: "initiator" } },
    ...Array.from({ length: 20 }, (_, index) => ({
      shipname: `Ship ${String(index + 8).padStart(2, "0")}`, owner: { discordUserId: OWNER },
    })),
    ...Array.from({ length: 16 }, (_, index) => ({
      shipname: "Ship 02", owner: { discordUserId: String(BigInt(OWNER) + BigInt(index + 1)) },
    })),
  ];
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false);
  await f.click(button(f.rendered.at(-1), "Search"));
  const checkbox = (modal, id) => modal.components.find((label) => label.component.custom_id === id)?.component;
  assert.equal(checkbox(f.modals.at(-1), "hide_owned").default, false);
  await f.submit(f.modals.at(-1), "", {}, true, true);
  let payload = f.rendered.at(-1);
  assert.match(contents(payload), /Flight ready only · Hide ships I own/);
  assert.doesNotMatch(contents(payload), /Ship 00|Ship 01|unknown/);
  assert.equal(pageLabel(payload), "Page 1 of 2");
  assert.deepEqual(menu(payload, "size").options.map((option) => option.label),
    ["All sizes (29)", "Large (29)", "Small (0)", "Unknown size (0)"]);
  assert.ok(components(payload).length <= 40, "filtered org cards must fit Discord's component limit");
  await f.click(button(payload, "Next"));
  f.restart();
  await f.click(button(f.rendered.at(-1), "Previous"));
  assert.match(contents(f.rendered.at(-1)), /Hide ships I own/);
  await f.click(button(f.rendered.at(-1), "Owners"));
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 1 of 2");
  f.restart();
  await f.click(button(f.rendered.at(-1), "Next"));
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 2 of 2");
  await f.click(button(f.rendered.at(-1), "Back to fleet"));
  payload = f.rendered.at(-1);
  await f.click(menu(payload, "size"), [sizeOption(payload, "Large").value]);
  await f.click(button(f.rendered.at(-1), "Search"));
  assert.equal(checkbox(f.modals.at(-1), "hide_owned").default, true);
  assert.equal(checkbox(f.modals.at(-1), "flight_ready_only").default, true);
  await f.submit(f.modals.at(-1), "Ship 0", {}, true, true);
  payload = f.rendered.at(-1);
  assert.equal(fleetRows(payload).length, 4);
  assert.equal(menu(payload, "size").options[0].label, "All sizes (20)");
  await f.click(button(payload, "Owners"));
  f.setShips([...ships, { shipname: "Ship 02", owner: { discordUserId: "initiator" } }]);
  f.restart();
  await f.click(button(f.rendered.at(-1), "Next"));
  payload = f.rendered.at(-1);
  assert.equal(fleetRows(payload).length, 3, "newly owned models must disappear on the next live read");
  assert.doesNotMatch(contents(payload), /Ship 00|Ship 02/);
  assert.match(contents(payload), /Search: Ship 0/);
  assert.equal(menu(payload, "size").options[0].label, "All sizes (3)");
  await f.click(button(payload, "Clear search"));
  payload = f.rendered.at(-1);
  assert.doesNotMatch(contents(payload), /Flight ready only|Hide ships I own|Search:/);
  assert.match(contents(payload), /Ship 00/);
  assert.match(contents(payload), /Ship 02/);
  assert.equal(menu(payload, "size").options[0].label, "All sizes (65)");
  assert.equal(menu(payload, "size").options.find((option) => option.default).label, "Large (49)");
  assert.deepEqual(f.replies, []);
});

test("org ownership filtering stays in Search and older card buttons refresh to the current layout", async () => {
  const f = fixture();
  const ships = [...f.ships, { shipname: "alias", owner: { discordUserId: "initiator" } },
    ...Array.from({ length: 20 }, (_, index) => ({
      shipname: `Ship ${String(index + 8).padStart(2, "0")}`, owner: { discordUserId: OWNER },
    }))];
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false);
  let payload = f.rendered.at(-1);
  assert.equal(button(payload, "Hide ships I own"), undefined);
  assert.equal(button(payload, "Show ships I own"), undefined);
  assert.ok(components(payload).length <= 40);
  await f.click(button(payload, "Search"));
  assert.ok(f.modals.at(-1).components.some((label) => label.component.custom_id === "hide_owned"));
  await f.submit(f.modals.at(-1), "Ship 0", {}, false, true);
  payload = f.rendered.at(-1);
  assert.equal(fleetRows(payload).length, 9);
  assert.doesNotMatch(contents(payload), /Ship 00/);
  assert.equal(button(payload, "Hide ships I own"), undefined);
  assert.equal(button(payload, "Show ships I own"), undefined);
  assert.ok(button(payload, "Clear search"));
  assert.ok(components(payload).length <= 40);
  const legacy = { custom_id: button(payload, "Clear search").custom_id.replace("#clear_search#", "#toggle_owned#") };
  f.restart();
  await f.click(legacy);
  payload = f.rendered.at(-1);
  assert.match(contents(payload), /Ship 00/);
  assert.match(contents(payload), /Search: Ship 0/);
  assert.equal(pageLabel(payload), "Page 1 of 2");
  assert.equal(button(payload, "Hide ships I own"), undefined);
  assert.equal(button(payload, "Show ships I own"), undefined);
  assert.ok(components(payload).length <= 40);
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false, "Member");
  assert.equal(button(f.rendered.at(-1), "Hide ships I own"), undefined);
  assert.equal(button(f.rendered.at(-1), "Show ships I own"), undefined);
  assert.deepEqual(f.replies, []);
});

test("hide-owned search accepts old popups and stays out of personal inventory", async () => {
  const f = fixture();
  const ships = [...f.ships, { shipname: "Ship 00", owner: { discordUserId: "initiator" } }];
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false);
  await f.click(button(f.rendered.at(-1), "Search"));
  const modal = f.modals.at(-1);
  const legacy = { ...modal, components: modal.components.filter((label) => label.component.custom_id !== "hide_owned") };
  f.restart();
  await f.submit(legacy, "Ship 0", {}, true);
  let payload = f.rendered.at(-1);
  assert.match(contents(payload), /Ship 00/);
  assert.match(contents(payload), /Flight ready only/);
  assert.doesNotMatch(contents(payload), /Hide ships I own/);
  await f.click(button(payload, "Search"));
  await f.submit(f.modals.at(-1), "", {}, false, true);
  payload = f.rendered.at(-1);
  assert.doesNotMatch(contents(payload), /Ship 00/);
  assert.match(contents(payload), /Ship 01/);
  assert.match(contents(payload), /unknown/);
  assert.equal(menu(payload, "size").options[0].label, "All sizes (8)");

  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false, "Member");
  await f.click(button(f.rendered.at(-1), "Search"));
  assert.ok(f.modals.at(-1).components.every((label) => label.component.custom_id !== "hide_owned"));
  await f.submit(f.modals.at(-1), "");
  assert.match(contents(f.rendered.at(-1)), /Ship 00/);
  assert.doesNotMatch(contents(f.rendered.at(-1)), /Hide ships I own/);
  assert.deepEqual(f.replies, []);
});

test("personal flight-ready search excludes missing statuses, clears cleanly, and accepts older popups", async () => {
  const f = fixture();
  f.setProductionStatus("Ship 02", undefined);
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", f.ships, false, "Member");
  await f.click(button(f.rendered.at(-1), "Search"));
  f.restart();
  await f.submit(f.modals.at(-1), "Ship 01", {
    fields: { fields: new Map(), getTextInputValue: () => "Ship 01" },
  });
  assert.match(contents(f.rendered.at(-1)), /Ship 01/);
  await f.click(button(f.rendered.at(-1), "Search"));
  await f.submit(f.modals.at(-1), "", {}, true);
  let payload = f.rendered.at(-1);
  assert.match(contents(payload), /Flight ready only/);
  assert.match(contents(payload), /Ship 00/);
  assert.doesNotMatch(contents(payload), /Ship 01|Ship 02|unknown/);
  await f.click(menu(payload, "size"), [sizeOption(payload, "Small").value]);
  payload = f.rendered.at(-1);
  assert.match(contents(payload), /No ships match these filters/);
  assert.equal(button(payload, "Next").disabled, true);
  await f.click(menu(payload, "size"), ["-1"]);
  f.restart();
  await f.click(button(f.rendered.at(-1), "Clear search"));
  payload = f.rendered.at(-1);
  assert.doesNotMatch(contents(payload), /Flight ready only|Search:/);
  assert.match(contents(payload), /Ship 01/);
  assert.match(contents(payload), /Ship 02/);
  assert.match(contents(payload), /unknown/);
  assert.equal(button(payload, "Clear search"), undefined);
  assert.deepEqual(f.replies, []);
});

test("personal inventory search filters the table and an empty query restores it", async () => {
  const f = fixture();
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", f.ships, false, "Member");
  await f.click(button(f.rendered.at(-1), "Search"));
  await f.submit(f.modals.at(-1), "ip 03");
  let payload = f.rendered.at(-1);
  let table = components(payload).find((item) => item.content?.startsWith("```\n")).content;
  assert.match(table, /Qty\s+Ship/);
  assert.match(table, /Ship 03/);
  assert.doesNotMatch(table, /Ship 00/);
  assert.equal(fleetRows(payload).length, 0);
  await f.click(button(payload, "Search"));
  await f.submit(f.modals.at(-1), "  ");
  payload = f.rendered.at(-1);
  table = components(payload).find((item) => item.content?.startsWith("```\n")).content;
  assert.match(table, /18\s+Ship 00/);
  assert.match(table, /unknown/);
  assert.equal(button(payload, "Clear search"), undefined);
});

test("search submissions recheck access and work after a restart", async () => {
  const f = fixture();
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", f.ships, false);
  const initial = f.rendered.at(-1);
  await f.click(button(initial, "Search"), undefined, { user: { id: "other" } });
  assert.equal(f.modals.length, 0);
  await f.click(button(initial, "Search"));
  const modal = f.modals.at(-1);
  await f.submit(modal, "Ship 01", { user: { id: "other" } });
  await f.submit(modal, "Ship 01", { message: { id: "copied" } });
  await f.submit(modal, "Ship 01", { guildId: "other" });
  await f.submit(modal, "Ship 01", { message: null, isFromMessage: () => false });
  assert.equal(f.rendered.length, 1);
  assert.equal(f.accessChecks, 0);
  f.setAccess(false);
  await f.submit(modal, "Ship 01", { guildId: null, inCachedGuild: () => false });
  assert.match(f.replies.at(-1).content, /no longer have access/);
  assert.equal(f.rendered.length, 1);
  f.setAccess(true);
  await f.click(button(initial, "Next"));
  assert.match(contents(f.rendered.at(-1)), /unknown/);
  const now = Date.now;
  try {
    const future = now() + 16 * 60_000;
    Date.now = () => future;
    f.restart();
    await f.submit(modal, "Ship 01");
    assert.match(contents(f.rendered.at(-1)), /Search:.*Ship 01/);
  } finally { Date.now = now; }
  assert.equal(f.rendered.length, 3);
  assert.ok(f.replies.every((reply) => reply.flags === MessageFlags.Ephemeral));
});

test("cards reload current SQLite inventory after restart and keep personal queries scoped", async (t) => {
  const fs = require("node:fs/promises");
  const os = require("node:os");
  const path = require("node:path");
  const { Sequelize } = require("sequelize-typescript");
  const { Ships, ShipDao } = loadModule("../built/models/Ships", { "../utils": { findShip: () => undefined } });
  const { User } = require("../built/models/User");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "iridium-live-inventory-"));
  const options = { dialect: "sqlite", storage: path.join(directory, "fixture.sqlite"), models: [Ships, User], logging: false };
  let db = new Sequelize(options);
  await db.sync({ force: true });
  t.after(async () => { await db.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const other = "100000000000000099";
  await User.bulkCreate([{ discordUserId: OWNER, lastKnownTag: "Member" }, { discordUserId: other, lastKnownTag: "Other" }]);
  const row = (shipname, owner = OWNER, guildId = GUILD) => ({ shipname, discordUserId: owner, guildId });
  await Ships.bulkCreate([
    row("Ship 00"), row("Ship 00"), row("Ship 01"),
    row("Ship 02", other), row("Ship 03", OWNER, "100000000000000002"),
    ...Array.from({ length: 24 }, (_, index) => row(`Ship ${String(index + 4).padStart(2, "0")}`)),
  ]);
  const f = fixture(ShipDao);
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", await ShipDao.findAll(GUILD), true);
  await f.click(button(f.rendered.at(-1), "Search"));
  await f.submit(f.modals.at(-1), "sHiP");
  await f.click(menu(f.rendered.at(-1), "size"), [sizeOption(f.rendered.at(-1), "Large").value]);
  await f.click(button(f.rendered.at(-1), "Owners"));
  const back = button(f.rendered.at(-1), "Back to fleet");
  await db.close();
  db = new Sequelize(options);
  await db.authenticate();
  await Ships.create(row("Ship 00", other));
  await Ships.destroy({ where: { shipname: "Ship 08", guildId: GUILD } });
  f.restart();
  await f.click(back);
  let payload = f.rendered.at(-1);
  assert.match(contents(payload), /Search:.*sHiP/);
  assert.match(contents(payload), /Ship 00 × 3/);
  assert.doesNotMatch(contents(payload), /Ship 08/);
  assert.match(contents(payload), /Loaners: Ship 01/);
  assert.equal(menu(payload, "size").options.find((option) => option.default).label, "Large (15)");
  await f.click(button(payload, "Owners"));
  assert.match(contents(f.rendered.at(-1)), new RegExp(`<@${other}> — \\*\\*1\\*\\*`));
  await f.click(button(f.rendered.at(-1), "Back to fleet"));
  f.restart();
  await f.click(button(f.rendered.at(-1), "Search"));
  assert.equal(f.modals.at(-1).components[0].component.value, "sHiP");

  await f.openFleetBrowser(f.command, GUILD, "Fixture org", await ShipDao.findShipsByOwnerId(OWNER, GUILD), false, "Member");
  const next = button(f.rendered.at(-1), "Next");
  await Ships.create(row("Ship 00"));
  f.restart();
  await f.click(next);
  await f.click(button(f.rendered.at(-1), "Previous"));
  payload = f.rendered.at(-1);
  assert.match(contents(payload), /Member · Inventory/);
  assert.match(contents(payload), /\n\s*3\s+Ship 00\n/);
  assert.doesNotMatch(contents(payload), /Ship 02|Ship 03/);
  assert.deepEqual(f.inventoryQueries.at(-1), ["view", OWNER, GUILD]);
});

test("live inventory changes keep size and ship selections stable and handle removed ships", async () => {
  const f = fixture();
  const row = (shipname, owner = OWNER) => ({ shipname, owner: { discordUserId: owner } });
  const small = [row("Ship 01"), row("Ship 03")];
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", small, false);
  await f.click(menu(f.rendered.at(-1), "size"), [sizeOption(f.rendered.at(-1), "Small").value]);
  await f.click(button(f.rendered.at(-1), "Search"));
  f.setShips([...small, row("Ship 00"), row("Ship 02")]);
  f.restart();
  await f.submit(f.modals.at(-1), "Ship");
  let payload = f.rendered.at(-1);
  assert.equal(menu(payload, "size").options.find((option) => option.default).label, "Small (2)");
  assert.doesNotMatch(contents(payload), /Ship 00|Ship 02/);

  const owner = "100000000000000044";
  const ships = [row("Ship 02"), row("Ship 04", owner), row("Ship 06")];
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ships, false);
  const selected = fleetRows(f.rendered.at(-1)).find((section) => section.components[0].content.includes("Ship 04")).accessory;
  f.setShips([row("Ship 00"), ...ships]);
  f.restart();
  await f.click(selected);
  assert.match(contents(f.rendered.at(-1)), /### Ship 04/);
  assert.match(contents(f.rendered.at(-1)), new RegExp(`<@${owner}>`));
  const next = button(f.rendered.at(-1), "Next");
  f.setShips([row("Ship 00")]);
  await f.click(next);
  assert.ok(button(f.rendered.at(-1), "Owners"));
  assert.doesNotMatch(contents(f.rendered.at(-1)), /Ship 04|<@/);
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 1 of 1");
});

test("live reads fail privately without changing the card, then recover on retry", async () => {
  const f = fixture();
  f.ships.push({ ...f.ships.at(-1), shipname: "Ship 08" });
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", f.ships, false);
  const next = button(f.rendered.at(-1), "Next");
  f.failInventory(new Error("fixture read failure"));
  await f.click(next);
  assert.equal(f.rendered.length, 1);
  assert.equal(f.replies.at(-1).flags, MessageFlags.Ephemeral);
  assert.match(f.replies.at(-1).content, /Couldn't update/);
  f.failInventory(undefined);
  await f.click(next);
  assert.equal(pageLabel(f.rendered.at(-1)), "Page 2 of 2");
});

test("stateless controls fit Discord limits and retain literal search text after restart", async () => {
  const f = fixture();
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", f.ships, false,
    { id: "10000000000000000001", name: "Member" });
  await f.click(menu(f.rendered.at(-1), "size"), [sizeOption(f.rendered.at(-1), "Small").value]);
  const query = String.raw`some **ship** _name_ ~~old~~ ||hidden|| \ path \* [link](x) ` + "🚀".repeat(12);
  await f.click(button(f.rendered.at(-1), "Search"));
  await f.submit(f.modals.at(-1), query, {}, true, false, 512);
  assert.ok(contents(f.rendered.at(-1)).includes(String.raw`\[link\]\(x\)`), "search links must render as literal text");
  f.restart();
  await f.click(button(f.rendered.at(-1), "Search"));
  assert.equal(f.modals.at(-1).components[0].component.value, query.trim());
  const ids = [...components(f.rendered.at(-1)).map((item) => item.custom_id).filter(Boolean), f.modals.at(-1).custom_id];
  assert.ok(ids.every((id) => id.length <= 100));
});

test("size options count ship quantities across all pages and respect search and inventory scope", async () => {
  const f = fixture();
  const counts = () => menu(f.rendered.at(-1), "size").options.map((option) => option.label);
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", f.ships, false);
  assert.deepEqual(counts(), ["All sizes (26)", "Large (21)", "Small (4)", "Unknown size (1)"]);
  let payload = f.rendered.at(-1);
  await f.click(menu(payload, "size"), [sizeOption(payload, "Large").value]);
  assert.deepEqual(counts(), ["All sizes (26)", "Large (21)", "Small (4)", "Unknown size (1)"]);
  await f.click(button(f.rendered.at(-1), "Search"));
  await f.submit(f.modals.at(-1), "ship 0");
  assert.deepEqual(counts(), ["All sizes (25)", "Large (21)", "Small (4)", "Unknown size (0)"]);
  payload = f.rendered.at(-1);
  assert.equal(menu(payload, "size").options.find((option) => option.default).label, "Large (21)");
  await f.click(button(payload, "Clear search"));
  assert.deepEqual(counts(), ["All sizes (26)", "Large (21)", "Small (4)", "Unknown size (1)"]);
  const ownShips = f.ships.filter((ship) => ship.owner.discordUserId === "100000000000000000");
  await f.openFleetBrowser(f.command, GUILD, "Fixture org", ownShips, false, "Member");
  assert.deepEqual(counts(), ["All sizes (10)", "Large (5)", "Small (4)", "Unknown size (1)"]);
});
