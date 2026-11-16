const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { ChannelType } = require("discord.js");

function loadModule(name, stubs) {
  const target = require.resolve(name);
  delete require.cache[target];
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === target && Object.hasOwn(stubs, request)) {
      return stubs[request];
    }
    return original.apply(this, arguments);
  };
  try {
    return require(target);
  } finally {
    Module._load = original;
  }
}

test("admin deletion waits for a guild-and-owner-scoped write and reports no false success", async () => {
  const replies = [];
  let resolveDelete;
  let rejectDelete;
  let deletedArgs;
  let deletePending = new Promise((resolve, reject) => { resolveDelete = resolve; rejectDelete = reject; });
  const { RemoveAllCommand } = loadModule("../built/commands/RemoveAllCommand", {
    "../models/Ships": { ShipDao: { clearInventory: (...args) => { deletedArgs = args; return deletePending; } } },
    "../utils": { authorizeGuildOwner: async () => "guild", replyTo: (_, text) => replies.push(text) },
  });
  const message = { isChatInputCommand: () => true, options: { getUser: () => ({ id: "target" }) } };
  const pending = RemoveAllCommand(message);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(deletedArgs, ["target", "guild"]);
  assert.deepEqual(replies, []);
  resolveDelete(2);
  await pending;
  assert.deepEqual(replies, ["2 ships deleted."]);

  deletePending = new Promise((resolve, reject) => { resolveDelete = resolve; rejectDelete = reject; });
  const failure = RemoveAllCommand(message);
  const rejection = assert.rejects(failure, /fixture write failure/);
  rejectDelete(new Error("fixture write failure"));
  await rejection;
  assert.deepEqual(replies, ["2 ships deleted."]);
});

test("database administration rejects shared channels and nonoperators before IO", async () => {
  let reads = 0;
  const delivered = [];
  const { DownloadDBCommand } = loadModule("../built/commands/DownloadDBCommand", {
    fs: { readFileSync: () => { reads++; return Buffer.from("fixture database"); } },
    "../models/User": { User: { isAdmin: (id) => id === "operator" } },
    "../utils": { replyTo: () => assert.fail("export must not reply to the originating channel") },
    "node-fetch": () => assert.fail("rejected messages must not download attachments"),
  });
  const message = (id, type) => ({
    author: { id, send: async (payload) => delivered.push({ id, payload }) },
    channel: { type },
    attachments: { find: () => { assert.equal(type, ChannelType.DM); return undefined; } },
  });
  await DownloadDBCommand(message("operator", ChannelType.GuildText));
  await DownloadDBCommand(message("operator", ChannelType.GroupDM));
  await DownloadDBCommand(message("member", ChannelType.DM));
  assert.equal(reads, 0);
  await DownloadDBCommand(message("operator", ChannelType.DM));
  assert.equal(reads, 1);
  assert.equal(delivered.length, 1);
  assert.equal(delivered[0].id, "operator");
  assert.equal(delivered[0].payload.files[0].name, "database.sqlite");
});

test("admin continuations reject other actors and legacy controls, preserving the initiator", async () => {
  const deletes = [];
  const replies = [];
  const updates = [];
  let guildReads = 0;
  const admin = loadModule("../built/commands/AdminUsers", {
    "../utils": {
      getUserId: (message) => message.user.id,
      authorizeGuildOwner: async () => { guildReads++; return "guild"; },
      getGuildUser: async () => null,
      replyTo: (...args) => replies.push(args),
      update: (_, payload) => updates.push(payload),
    },
    "../models/User": { User: { findById: async () => [{ discordUserId: "target", lastKnownTag: "old-tag" }] } },
    "../models/Ships": {
      ShipDao: { findShipsByOwnerId: async () => [{ shipname: "fixture" }] },
      Ships: { destroy: async (query) => deletes.push(query.where) },
    },
  });
  const interaction = (customId, actor = "other") => ({ customId, guildId: "guild", user: { id: actor }, values: ["target"] });
  for (const [handler, id] of [
    [admin.AdminClearButton, "delete_guild"],
    [admin.AdminUsersSelect, "delete_user_select"],
    [admin.AdminUsersDeleteButton, "delete_user_button#target"],
  ]) {
    await handler(interaction(id));
    await handler(interaction(`${id}#initiator`));
  }
  assert.equal(guildReads, 0);
  assert.equal(deletes.length, 0);
  assert.equal(replies.length, 6);
  assert.ok(replies.every((args) => args[5] === true));
  await admin.AdminUsersSelect(interaction("delete_user_select#initiator#guild", "initiator"));
  const button = updates.at(-1).components[0].components[0].data.custom_id;
  assert.equal(button, "delete_user_button#target#initiator#guild");
  await admin.AdminUsersDeleteButton(interaction(button, "initiator"));
  await admin.AdminClearButton(interaction("delete_guild#initiator#guild", "initiator"));
  assert.deepEqual(deletes, [{ guildId: "guild", discordUserId: "target" }, { guildId: "guild" }]);
});

test("Discord dispatch contains command failures and gives a recoverable error response", async () => {
  const discord = require("discord.js");
  let listener;
  class FixtureClient { on(event, callback) { if (event === "interactionCreate") listener = callback; return this; } }
  const handlers = loadModule("../built/handlers/DiscordHandlers", {
    "discord.js": { ...discord, Client: FixtureClient },
    "../utils": { updateUser: async () => {}, getGuildId: async () => "guild",
      getCommand: async () => ({ command: "inventory", subCommand: "org" }), getUserTag: () => "fixture", getUserId: () => "owner" },
    "../models/User": {}, "../models/Ships": {},
    "../commands/fleet-browser": { FleetBrowserHandler: async () => {} },
    "../commands": { InventoryCommand: async () => { throw new Error("fixture database failure"); } },
    "../logging/logging": { commandsLogger: { info: () => {}, error: () => {} } },
    "../../botconfig.json": "fixture-token", "../../admins.json": [],
    "@discordjs/rest": { REST: class { setToken() { return this; } } },
  });
  handlers.registerOnMessage();
  const responses = [];
  const interaction = {
    commandName: "inventory", user: { id: "owner" },
    isCommand: () => true, isChatInputCommand: () => true, isRepliable: () => true,
    options: { getSubcommand: () => "org" },
    async deferReply() { this.deferred = true; },
    editReply: async (payload) => responses.push(payload),
  };
  await assert.doesNotReject(listener(interaction));
  assert.match(responses[0].content, /try again/i);
  assert.doesNotMatch(responses[0].content, /fixture database failure/);
  handlers.handlers.fixture = async () => { throw new Error("fixture component failure"); };
  await assert.doesNotReject(listener({
    customId: "fixture", isCommand: () => false, isButton: () => true,
    isRepliable: () => true, isChatInputCommand: () => false,
    reply: async (payload) => responses.push(payload),
  }));
  assert.equal(responses[1].flags, discord.MessageFlags.Ephemeral);
  interaction.editReply = async () => { throw new Error("fixture delivery failure"); };
  await assert.doesNotReject(listener(interaction));
  let modalCalls = 0;
  handlers.handlers.fixture = async () => { modalCalls++; };
  await listener({
    customId: "fixture", isCommand: () => false, isButton: () => false,
    isSelectMenu: () => false, isModalSubmit: () => true, isAutocomplete: () => false,
  });
  assert.equal(modalCalls, 1, "modal submissions must reach their registered handler");
});

test("Discord dispatch keeps destructive confirmations private from the initial acknowledgement", async () => {
  const discord = require("discord.js");
  const listeners = new Map();
  class FixtureClient {
    on(event, callback) { listeners.set(event, callback); return this; }
  }
  const utils = loadModule("../built/utils", {
    "./models/Ships": {},
    "./models/User": {},
    "./handlers/DiscordHandlers": { memberGuildsCache: new Map() },
    "./commands": {},
  });
  utils.updateUser = async () => {};
  utils.getGuildId = async () => "fixture-guild";
  utils.authorizeGuildOwner = async () => "fixture-guild";
  const admin = loadModule("../built/commands/AdminUsers", {
    "../utils": utils,
    "../models/User": {},
    "../models/Ships": {},
  });
  const clear = loadModule("../built/commands/RemoveShipCommand", { "../utils": utils, "../models/Ships": {} });
  const handlers = loadModule("../built/handlers/DiscordHandlers", {
    "discord.js": { ...discord, Client: FixtureClient },
    "../utils": utils,
    "../models/User": {},
    "../models/Ships": {},
    "../commands": {
      AdminClearCommand: admin.AdminClearCommand,
      RemoveShipCommand: clear.RemoveShipCommand,
      InventoryCommand: (message) => utils.replyTo(message, "Fixture inventory"),
    },
    "../logging/logging": { commandsLogger: { info: () => {} } },
    "../../botconfig.json": "fixture-token",
    "../../admins.json": [],
    "@discordjs/rest": { REST: class { setToken() { return this; } } },
  });
  handlers.registerOnMessage();
  for (const [commandName, subCommand] of [["admin", "clear"], ["inventory", "view"], ["inventory", "clear"]]) {
    const calls = [];
    const message = {
      commandName, user: { id: "initiator", tag: "fixture" }, channel: {},
      isCommand: () => true, isChatInputCommand: () => true,
      options: { getSubcommand: () => subCommand, getString: () => null },
      deferReply: async function (options) { calls.push(["defer", options]); this.deferred = true; },
      editReply: async (payload) => { calls.push(["edit", payload]); },
      reply: () => assert.fail("the command must edit its acknowledged response"),
      followUp: () => assert.fail("the initial command reply must remain the original response"),
    };
    await listeners.get("interactionCreate")(message);
    assert.deepEqual(calls.map(([name]) => name), ["defer", "edit"]);
    if (subCommand === "clear") {
      assert.equal(calls[0][1].flags, discord.MessageFlags.Ephemeral);
      assert.equal(calls[1][1].components[0].components[0].data.custom_id,
        commandName === "admin" ? "delete_guild#initiator#fixture-guild" : "delete_inventory#initiator#fixture-guild");
    } else {
      assert.equal(calls[0][1], undefined);
      assert.equal(calls[1][1].embeds[0].data.description, "Fixture inventory");
    }
  }
});

test("imports bound downloaded bytes and entries while preserving duplicates and awaited outcomes", async () => {
  const http = require("node:http");
  const limits = require("../built/shipLimits");
  let body = "[]";
  let requests = 0;
  const server = http.createServer((_, response) => { requests++; response.end(body); });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const replies = [];
  let writes = 0;
  let accepted = true;
  let persisted = [];
  const { ImportCommand } = loadModule("../built/commands/ImportCommand", {
    "../utils": {
      getGuildId: async () => "guild",
      replyTo: (_, text) => replies.push(text),
      bulkFindShips: (names) => names.filter((name) => name === "avenger").map((name) => ({ name })),
      bulkCreateShips: async (ships) => {
        writes++;
        await new Promise((resolve) => setImmediate(resolve));
        persisted = accepted ? ships : [];
        return accepted;
      },
    },
  });
  let metadataSize = 1;
  const message = {
    user: { id: "owner" },
    isChatInputCommand: () => true,
    options: { getAttachment: () => ({ url: `http://127.0.0.1:${server.address().port}/`, size: metadataSize }) },
  };
  try {
    const oversizedFileBytes = 2 * 1024 * 1024 + 1;
    metadataSize = oversizedFileBytes;
    await ImportCommand(message);
    assert.equal(requests, 0);
    assert.match(replies.at(-1), /too large.*Maximum 2 MiB/);
    metadataSize = 1;
    body = " ".repeat(oversizedFileBytes);
    await ImportCommand(message);
    assert.equal(writes, 0);
    assert.match(replies.at(-1), /too large.*Maximum 2 MiB/);
    body = JSON.stringify(Array.from({ length: 3001 }, () => ({ name: "avenger" })));
    await ImportCommand(message);
    assert.equal(writes, 0);
    assert.match(replies.at(-1), /too many entries/);
    body = JSON.stringify([{ name: "x".repeat(limits.MAX_IMPORT_NAME_LENGTH + 1) }]);
    await ImportCommand(message);
    assert.equal(writes, 0);
    assert.match(replies.at(-1), /invalid ship name/);
    body = JSON.stringify([{ name: "Avenger" }, { name: "Avenger" }, { name: "unknown" }]);
    await ImportCommand(message);
    assert.equal(persisted.length, 2);
    assert.match(replies.at(-1), /Importing \*\*2\*\* ships.*\*\*1\*\* entries/);
    accepted = false;
    await ImportCommand(message);
    assert.equal(persisted.length, 0);
    assert.match(replies.at(-1), /Org limit reached/);
    body = JSON.stringify([{ name: "Avenger", type: "ship" }, { name: "Avenger", type: "paint" }]);
    accepted = true;
    await ImportCommand(message);
    assert.equal(persisted.length, 1);
    body = JSON.stringify([{ name: "Avenger", type: "ship" }, ...Array.from({ length: 10000 }, () => ({ name: "Paint", type: "paint" }))]);
    await ImportCommand(message);
    assert.equal(persisted.length, 1);
    assert.match(replies.at(-1), /Importing \*\*1\*\* ships/);
    body = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({
      ship_code: "AEGS_Avenger_Titan", ship_name: "Fixture nickname".padEnd(64, "x"),
      manufacturer_code: "AEGS", manufacturer_name: "Aegis Dynamics",
      lti: true, name: "Avenger", orig_name: "Aegis Avenger Titan", warbond: false,
      entity_type: "ship", pledge_id: String(10000000 + i),
      pledge_name: "Standalone Ship - Avenger Titan".padEnd(200, "x"),
      pledge_date: "November 16, 2026, 11:59:59 PM", pledge_cost: "$5,000.00 USD", ccud: false,
    })), null, 2);
    metadataSize = Buffer.byteLength(body);
    await ImportCommand(message);
    assert.equal(persisted.length, 500, "a full Hangar XPLORer-shaped fleet retains duplicate ships and extra metadata");
    assert.equal(replies.at(-1), "Importing **500** ships.");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("SQLite quota is atomic and deletion isolates immutable owners and guilds", async () => {
  const { Sequelize } = require("sequelize-typescript");
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === "../../admins.json") return [];
    if (parent?.filename === require.resolve("../built/utils")) {
      if (request === "./handlers/DiscordHandlers") return { memberGuildsCache: new Map() };
      if (request === "./commands") return {};
    }
    return original.apply(this, arguments);
  };
  let models;
  let User;
  let utils;
  try {
    models = require("../built/models/Ships");
    ({ User } = require("../built/models/User"));
    utils = require("../built/utils");
  } finally {
    Module._load = original;
  }
  const { Ships, ShipDao } = models;
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "iridium-security-test-"));
  const sequelize = new Sequelize({ dialect: "sqlite", storage: path.join(directory, "fixture.sqlite"), models: [Ships, User], logging: false });
  ShipDao.sequelize = sequelize;
  try {
    await sequelize.sync({ force: true });
    await User.bulkCreate([
      { discordUserId: "owner", lastKnownTag: "reused", lastKnownDisplayName: "Owner" },
      { discordUserId: "victim", lastKnownTag: "reused", lastKnownDisplayName: "Victim" },
    ]);
    const ship = (guildId = "quota", discordUserId = "owner") => ({ guildId, discordUserId, shipname: "Aegis Avenger Titan" });
    await Ships.bulkCreate([
      ...Array.from({ length: 2500 }, () => ship("quota", "victim")),
      ...Array.from({ length: 499 }, () => ship()),
    ]);
    const results = await Promise.all([ShipDao.create(ship()), ShipDao.bulkCreate([ship()])]);
    assert.deepEqual(results.sort(), [false, true]);
    assert.equal(await ShipDao.count("quota"), 3000);
    assert.equal(await ShipDao.create(ship()), false);
    assert.equal(await ShipDao.bulkCreate([ship("other"), ship("other")]), true);
    await assert.rejects(ShipDao.bulkCreate([ship("other"), ship("quota")]));
    assert.equal(await ShipDao.count("other"), 2);
    await assert.rejects(ShipDao.bulkCreate([ship("other"), ship("other", "missing-owner")]));
    assert.equal(await ShipDao.count("other"), 2);

    await assert.rejects(ShipDao.bulkCreate(Array.from({ length: 3000 }, () => ship("member-quota"))), /Member limit/);
    assert.equal(await ShipDao.count("member-quota"), 0, "a quota rejection must not insert partial data");
    assert.equal(await ShipDao.bulkCreate(Array.from({ length: 499 }, () => ship("member-quota"))), true);
    const personalRace = await Promise.allSettled([
      ShipDao.create(ship("member-quota")), ShipDao.bulkCreate([ship("member-quota")]),
    ]);
    assert.equal(personalRace.filter((result) => result.status === "fulfilled" && result.value === true).length, 1);
    assert.match(personalRace.find((result) => result.status === "rejected").reason.message, /500 ships per server/);
    assert.equal(await ShipDao.count("member-quota"), 500);
    assert.equal(await ShipDao.create(ship("member-quota", "victim")), true,
      "another member can still add after the first reaches their personal quota");
    assert.equal(await ShipDao.create(ship("separate-member-guild")), true,
      "the personal quota must be scoped by guild");
    await assert.rejects(ShipDao.bulkCreate([ship("member-quota", "victim"), ship("member-quota")]), /Member limit/);
    assert.equal(await Ships.count({ where: { guildId: "member-quota", discordUserId: "victim" } }), 1,
      "mixed-owner batches must also be atomic");
    await Ships.bulkCreate([ship("fleet"), ship("fleet", "victim"), ship("another")]);
    // Use an in-memory catalog; no network, bot session, or personal database.
    // The catalog reader uses fixed upstream URLs; stub that module at load time for the isolated lookup.
    const catalogUtils = loadModule("../built/utils", {
      "node-fetch": async () => ({ ok: true, json: async () => ({ items: [{ name: "Aegis Avenger Titan", rsiName: "Aegis Avenger Titan", slug: "aegis-avenger-titan", rsiSlug: "aegis-avenger-titan" }] }) }),
      "./handlers/DiscordHandlers": { memberGuildsCache: new Map() },
      "./commands": {},
    });
    await catalogUtils.refreshShipList();
    // deleteShip retains the original utils module; update that module's exported lookup for this fixture.
    utils.findShip = catalogUtils.findShip;
    const replies = [];
    catalogUtils.getGuildId = async (message) => message.guildId;
    catalogUtils.replyTo = (_, text) => replies.push(text);
    const { AddShipCommand } = loadModule("../built/commands/AddShipCommand", { "../utils": catalogUtils });
    const { RemoveShipCommand, ClearConfirmationHandler } = loadModule("../built/commands/RemoveShipCommand", { "../utils": catalogUtils });
    let subcommand = "add";
    const interaction = {
      guildId: "command-test", user: { id: "owner", tag: "reused" }, commandName: "inventory",
      isChatInputCommand: () => true,
      options: { getString: () => "Avenger", getSubcommand: () => subcommand },
      customId: "delete_inventory#owner#command-test",
      deferUpdate: async () => {},
      editReply: async () => {},
      update: async () => {},
    };
    await AddShipCommand({ ...interaction, guildId: "quota" });
    assert.match(replies.at(-1), /Org limit reached/);
    assert.equal(await ShipDao.count("quota"), 3000);
    await AddShipCommand({ ...interaction, guildId: "member-quota" });
    assert.match(replies.at(-1), /Member limit reached.*500/);
    await AddShipCommand(interaction);
    await AddShipCommand(interaction);
    assert.equal(await ShipDao.count("command-test"), 2);
    assert.match(replies.at(-1), /added/);
    await ShipDao.create(ship("command-test", "victim"));
    subcommand = "remove";
    await RemoveShipCommand(interaction);
    assert.equal(await Ships.count({ where: { guildId: "command-test", discordUserId: "owner" } }), 1);
    assert.match(replies.at(-1), /Removed/);
    await ClearConfirmationHandler(interaction);
    assert.equal(await Ships.count({ where: { guildId: "command-test", discordUserId: "owner" } }), 0);
    assert.equal(await Ships.count({ where: { guildId: "command-test", discordUserId: "victim" } }), 1);
    await ShipDao.clearInventory("owner", "fleet");
    assert.equal(await Ships.count({ where: { guildId: "fleet", discordUserId: "victim" } }), 1);
    assert.equal(await Ships.count({ where: { guildId: "another", discordUserId: "owner" } }), 1);
    assert.equal(await Ships.count({ where: { guildId: "fleet", discordUserId: "owner" } }), 0);
    await Ships.bulkCreate([ship("atomic-clear"), { ...ship("atomic-clear"), shipname: "Blocked ship" }]);
    await sequelize.query("CREATE TRIGGER fail_clear BEFORE DELETE ON Ships WHEN OLD.guildId = 'atomic-clear' AND OLD.shipname = 'Blocked ship' BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END");
    await assert.rejects(ShipDao.clearInventory("owner", "atomic-clear"));
    assert.equal(await Ships.count({ where: { guildId: "atomic-clear", discordUserId: "owner" } }), 2,
      "a failed clear must not leave part of the inventory deleted");
    await sequelize.query("DROP TRIGGER fail_clear");
    assert.equal(await ShipDao.clearInventory("owner", "atomic-clear"), 2);

    const { RemoveAllCommand } = loadModule("../built/commands/RemoveAllCommand", {
      "../models/Ships": { ShipDao },
      "../utils": { authorizeGuildOwner: async () => "admin-test", replyTo: (_, text) => replies.push(text) },
    });
    await Ships.bulkCreate([ship("admin-test"), ship("admin-test", "victim"), ship("admin-other", "victim")]);
    await RemoveAllCommand({ isChatInputCommand: () => true, options: { getUser: () => ({ id: "victim" }) } });
    assert.equal(await Ships.count({ where: { guildId: "admin-test", discordUserId: "victim" } }), 0);
    assert.equal(await Ships.count({ where: { guildId: "admin-test", discordUserId: "owner" } }), 1);
    assert.equal(await Ships.count({ where: { guildId: "admin-other", discordUserId: "victim" } }), 1);
    assert.equal(replies.at(-1), "1 ships deleted.");

    await ShipDao.create({ ...ship("retired-fleet"), shipname: "Retired uncatalogued ship" });
    await ShipDao.clearInventory("owner", "retired-fleet");
    assert.equal(await ShipDao.count("retired-fleet"), 0, "clear must remove ships even when the catalog no longer contains them");
  } finally {
    await sequelize.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
