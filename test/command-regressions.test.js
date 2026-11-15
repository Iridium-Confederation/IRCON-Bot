const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");
const Discord = require("discord.js");

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

function loadUtils(stubs = {}) {
  return loadModule("../built/utils", {
    "./models/Ships": {}, "./models/User": {}, "./commands": {},
    "./handlers/DiscordHandlers": { client: {}, memberGuildsCache: new Map() },
    ...stubs,
  });
}

test("long private replies stay in the interaction, retain all text, and attach controls once", async () => {
  const publicSends = [];
  class Channel { async send(payload) { publicSends.push(payload); } }
  const utils = loadUtils({ "discord.js": { ...Discord, TextChannel: Channel } });
  const events = [];
  let active = false;
  const message = {
    channel: new Channel(), deferred: true, replied: false, ephemeral: true,
    async editReply(payload) {
      assert.equal(active, false); active = true;
      await new Promise((resolve) => setImmediate(resolve));
      events.push({ type: "edit", payload }); this.replied = true; active = false;
    },
    async followUp(payload) {
      assert.equal(active, false); active = true;
      await new Promise((resolve) => setImmediate(resolve));
      events.push({ type: "followUp", payload }); active = false;
    },
  };
  const attachment = new Discord.AttachmentBuilder(Buffer.from("fixture")).setName("fixture.txt");
  const controls = [new Discord.ActionRowBuilder().addComponents(
    new Discord.ButtonBuilder().setCustomId("fixture").setLabel("Fixture").setStyle(Discord.ButtonStyle.Secondary),
  )];
  const contents = "x".repeat(1799) + "🚀" + "\nFleet entry".repeat(400);
  await utils.replyTo(message, contents, attachment, "Fleet", controls, false);
  assert.deepEqual(publicSends, []);
  assert.ok(events.length > 1);
  assert.equal(events[0].type, "edit");
  assert.equal(events.map(({ payload }) => payload.embeds[0].toJSON().description).join(""), contents);
  for (const { payload } of events) assert.equal(payload.embeds[0].toJSON().description.isWellFormed(), true);
  assert.deepEqual(events[0].payload.files, [attachment]);
  assert.deepEqual(events[0].payload.components, controls);
  for (const { type, payload } of events.slice(1)) {
    assert.equal(type, "followUp");
    assert.equal(payload.flags & Discord.MessageFlags.Ephemeral, Discord.MessageFlags.Ephemeral);
    assert.deepEqual(payload.files, []);
    assert.deepEqual(payload.components, []);
  }
});

test("a stale guild membership does not hide a user's other guilds or swallow network failures", async () => {
  let failure = { code: 10007 };
  const valid = { id: "valid", members: { fetch: async () => ({}) } };
  const stale = { id: "stale", members: { fetch: async () => { throw failure; } } };
  const joined = { id: "joined", members: { cache: new Map([["owner", {}]]), fetch: async () => ({}) } };
  const utils = loadUtils({ "./handlers/DiscordHandlers": {
    client: { guilds: { cache: new Discord.Collection([["stale", stale], ["valid", valid], ["joined", joined]]) } },
    memberGuildsCache: new Map([["owner", new Set(["stale", "valid"])]]),
  } });
  const message = { user: { id: "owner" }, inGuild: () => false };
  assert.deepEqual([...(await utils.getUserGuilds(message)).keys()], ["valid", "joined"]);
  failure = new Error("Discord unavailable");
  await assert.rejects(utils.getUserGuilds(message, "stale"), /Discord unavailable/);
});

test("clear confirmations cannot change owners or follow a changed DM server selection", async () => {
  let guildId = "first";
  const replies = [];
  const deletes = [];
  const commands = loadModule("../built/commands/RemoveShipCommand", {
    "../utils": {
      getGuildId: async () => guildId,
      getUserId: (message) => message.user.id,
      replyTo: (...args) => replies.push(args),
    },
    "../models/Ships": { ShipDao: { clearInventory: async (...args) => deletes.push(args) } },
  });
  await commands.RemoveShipCommand({ user: { id: "owner" }, isChatInputCommand: () => true,
    options: { getSubcommand: () => "clear", getString: () => null } });
  const customId = replies[0][4][0].toJSON().components[0].custom_id;
  const events = [];
  const click = (id, control = customId) => ({
    customId: control, user: { id },
    deferUpdate: async () => events.push("defer"),
    editReply: async () => events.push("edit"),
    update: async () => events.push("update"),
  });
  guildId = "second";
  await commands.ClearConfirmationHandler(click("owner"));
  assert.deepEqual(deletes, [], "an old confirmation must not clear a newly selected server");
  guildId = "first";
  await commands.ClearConfirmationHandler(click("other"));
  await commands.ClearConfirmationHandler(click("owner", "delete_inventory"));
  assert.deepEqual(deletes, []);
  events.length = 0;
  await commands.ClearConfirmationHandler(click("owner"));
  assert.deepEqual(deletes, [["owner", "first"]]);
  assert.deepEqual(events, ["defer", "edit"]);
});

test("clear confirmation waits for deletion and never confirms a failed write", async () => {
  const events = [];
  let resolveDelete;
  let failure;
  const pendingDelete = new Promise((resolve) => { resolveDelete = resolve; });
  const { ClearConfirmationHandler } = loadModule("../built/commands/RemoveShipCommand", {
    "../utils": { getGuildId: async () => "guild", getUserId: (message) => message.user.id },
    "../models/Ships": { ShipDao: { clearInventory: async (owner, guild) => {
      assert.deepEqual([owner, guild], ["owner", "guild"]);
      events.push("delete");
      if (failure) throw failure;
      return pendingDelete;
    } } },
  });
  const click = { customId: "delete_inventory#owner#guild", user: { id: "owner" },
    deferUpdate: async () => events.push("defer"), editReply: async () => events.push("edit") };
  const pending = ClearConfirmationHandler(click);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["defer", "delete"]);
  resolveDelete(2);
  await pending;
  assert.deepEqual(events, ["defer", "delete", "edit"]);
  failure = new Error("fixture write failure");
  await assert.rejects(ClearConfirmationHandler(click), /fixture write failure/);
  assert.deepEqual(events, ["defer", "delete", "edit", "defer", "delete"]);
});

test("a short add request returns one validation reply without attempting a write", async () => {
  const replies = [];
  let writes = 0;
  const { AddShipCommand } = loadModule("../built/commands/AddShipCommand", {
    "../utils": { getGuildId: async () => "guild", replyTo: (_, text) => replies.push(text),
      addShip: async () => { writes++; } },
  });
  await AddShipCommand({ isChatInputCommand: () => true, options: { getString: () => "x" } });
  assert.deepEqual(replies, ["Could you be more specific?"]);
  assert.equal(writes, 0);
});

test("personal exports use immutable ownership after renaming and organization exports retain everyone", async () => {
  const rows = [
    { shipname: "Avenger", owner: { discordUserId: "owner", lastKnownTag: "old_name" } },
    { shipname: "Corsair", owner: { discordUserId: "other", lastKnownTag: "other" } },
  ];
  let subCommand = "user";
  const replies = [];
  const { FleetViewCommand } = loadModule("../built/commands/FleetViewCommand", {
    "../utils": {
      getCommand: async () => ({ subCommand }), getGuildId: async () => "guild",
      getUserTag: (message) => message.user.tag, getUserId: (message) => message.user.id,
      replyTo: (_, text, file) => replies.push({ text, file }),
    },
    "../models/Ships": { ShipDao: {
      findShipsByOwnerId: async (id, guild) => { assert.equal(guild, "guild"); return rows.filter((row) => row.owner.discordUserId === id); },
      findAll: async (guild) => { assert.equal(guild, "guild"); return rows; },
    } },
  });
  const user = { id: "owner", tag: "new_name" };
  const message = { user, isChatInputCommand: () => true, options: { getUser: () => null } };
  await FleetViewCommand(message);
  assert.ok(replies.at(-1).file, "renamed owner must still receive an export");
  assert.deepEqual(JSON.parse(replies.at(-1).file.attachment.toString()).map((row) => row.name), ["Avenger"]);
  message.options.getUser = () => ({ id: "other", tag: "renamed_other" });
  await FleetViewCommand(message);
  assert.deepEqual(JSON.parse(replies.at(-1).file.attachment.toString()).map((row) => row.name), ["Corsair"]);
  subCommand = "org";
  await FleetViewCommand(message);
  assert.equal(JSON.parse(replies.at(-1).file.attachment.toString()).length, 2);
});

test("search preserves uncatalogued ship names and distinct owners sharing an old tag", async () => {
  let output;
  const owner = (id) => ({ discordUserId: id, lastKnownTag: "same#0000" });
  const { SearchCommand } = loadModule("../built/commands/SearchCommand", {
    "../utils": { getGuildId: async () => "guild", findShip: () => undefined, replyTo: (_, text) => { output = text; } },
    "../models/Ships": { ShipDao: { findShipsByName: async () => [
      { shipname: "Retired Alpha", owner: owner("one") },
      { shipname: "Retired Alpha", owner: owner("two") },
      { shipname: "Retired Beta", owner: owner("one") },
    ] } },
  });
  await SearchCommand({ isChatInputCommand: () => true, options: { getString: () => "retired" } });
  assert.match(output, /\*\*Retired Alpha\*\*: same, same/);
  assert.match(output, /\*\*Retired Beta\*\*: same/);
  assert.doesNotMatch(output, /undefined/);
});

test("ship statistics read the current catalog size field", async () => {
  let output;
  const { StatsCommand } = loadModule("../built/commands/StatsCommand", {
    "../utils": {
      getGuildId: async () => "guild",
      findShip: () => ({ rsiName: "Fixture ship", metrics: { sizeLabel: "Large" }, onSale: true, pledgePrice: 100, storeUrl: "https://example.invalid/ship" }),
      replyTo: (_, text) => { output = text; },
    }, "../models/Ships": {}, "../models/User": {},
  });
  await StatsCommand({ isChatInputCommand: () => true, options: { getString: () => "fixture" } });
  assert.match(output, /\*\*Large\*\* vessel/);
  assert.doesNotMatch(output, /undefined/);
});

test("organization statistics await contributor lookups before completing", async () => {
  let release;
  const lookup = new Promise((resolve) => { release = resolve; });
  const replies = [];
  const { StatsCommand } = loadModule("../built/commands/StatsCommand", {
    "../utils": {
      getGuildId: async () => "guild", getTotalUsd: () => 100,
      getUserGuilds: async () => new Map([["guild", { name: "Fixture" }]]),
      getGuildUser: () => lookup, replyTo: (_, text) => replies.push(text),
    }, "../models/Ships": { ShipDao: { findAll: async () => [{ owner: { discordUserId: "owner" } }] } },
    "../models/User": {},
  });
  let completed = false;
  const running = StatsCommand({ isChatInputCommand: () => true, options: { getString: () => null } }).then(() => { completed = true; });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(completed, false);
  } finally { release({ nickname: "Fixture owner" }); await running; }
  assert.match(replies[0], /Fixture owner/);
});

test("disconnected-user administration awaits its membership lookups before completing", async () => {
  let release;
  const lookup = new Promise((resolve) => { release = resolve; });
  const replies = [];
  const { AdminUsersCommand } = loadModule("../built/commands/AdminUsers", {
    "../utils": { authorizeGuildOwner: async () => "guild", getGuildUser: () => lookup,
      getUserId: () => "owner", replyTo: (_, text) => replies.push(text) },
    "../models/Ships": { ShipDao: { findAll: async () => [{ discordUserId: "owner" }] } },
    "../models/User": { User: { findByGuild: async () => [{ discordUserId: "owner", lastKnownTag: "Fixture" }] } },
  });
  let completed = false;
  const running = AdminUsersCommand({}).then(() => { completed = true; });
  try {
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(completed, false);
  } finally { release({}); await running; }
  assert.equal(replies[0], "No disconnected users to manage.");
});

test("catalog refresh failures retain a healthy catalog and initial failure rejects cleanly", async () => {
  const ship = { name: "Fixture ship", rsiName: "Fixture ship", slug: "fixture-ship", rsiSlug: "fixture-ship" };
  let mode = "healthy";
  const fetch = async () => ({ ok: mode !== "unavailable", status: mode === "unavailable" ? 503 : 200,
    json: async () => mode === "healthy" ? { items: [ship] } : { error: "unavailable" },
  });
  const utils = loadUtils({ "node-fetch": fetch });
  await utils.refreshShipList();
  assert.equal(utils.findShip("Fixture ship").name, ship.name);
  const exit = process.exit;
  process.exit = () => { throw new Error("catalog refresh must not terminate the bot"); };
  try {
    mode = "unavailable";
    await utils.refreshShipList();
    assert.equal(utils.findShip("Fixture ship").name, ship.name);
    mode = "malformed";
    await utils.refreshShipList();
    assert.equal(utils.findShip("Fixture ship").name, ship.name);
    const cold = loadUtils({ "node-fetch": fetch });
    await assert.rejects(cold.refreshShipList());
  } finally { process.exit = exit; }
});
