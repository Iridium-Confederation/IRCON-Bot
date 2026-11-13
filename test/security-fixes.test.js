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
      getGuildId: async () => { guildReads++; return "guild"; },
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
  const interaction = (customId, actor = "other") => ({ customId, user: { id: actor }, values: ["target"] });
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
  await admin.AdminUsersSelect(interaction("delete_user_select#initiator", "initiator"));
  const button = updates.at(-1).components[0].components[0].data.custom_id;
  assert.equal(button, "delete_user_button#target#initiator");
  await admin.AdminUsersDeleteButton(interaction(button, "initiator"));
  await admin.AdminClearButton(interaction("delete_guild#initiator", "initiator"));
  assert.deepEqual(deletes, [{ guildId: "guild", discordUserId: "target" }, { guildId: "guild" }]);
});

test("Discord dispatch keeps admin confirmations private from the initial acknowledgement", async () => {
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
  const admin = loadModule("../built/commands/AdminUsers", {
    "../utils": utils,
    "../models/User": {},
    "../models/Ships": {},
  });
  const handlers = loadModule("../built/handlers/DiscordHandlers", {
    "discord.js": { ...discord, Client: FixtureClient },
    "../utils": utils,
    "../models/User": {},
    "../models/Ships": {},
    "../commands": {
      AdminClearCommand: admin.AdminClearCommand,
      InventoryCommand: (message) => utils.replyTo(message, "Fixture inventory"),
    },
    "../logging/logging": { commandsLogger: { info: () => {} } },
    "../../botconfig.json": "fixture-token",
    "../../admins.json": [],
    "@discordjs/rest": { REST: class { setToken() { return this; } } },
  });
  handlers.registerOnMessage();
  for (const commandName of ["admin", "inventory"]) {
    const calls = [];
    const message = {
      commandName, user: { id: "initiator", tag: "fixture" }, channel: {},
      isCommand: () => true, isChatInputCommand: () => true,
      options: { getSubcommand: () => commandName === "admin" ? "clear" : "view" },
      deferReply: async function (options) { calls.push(["defer", options]); this.deferred = true; },
      editReply: async (payload) => { calls.push(["edit", payload]); },
      reply: () => assert.fail("the command must edit its acknowledged response"),
      followUp: () => assert.fail("the initial command reply must remain the original response"),
    };
    await listeners.get("interactionCreate")(message);
    assert.deepEqual(calls.map(([name]) => name), ["defer", "edit"]);
    if (commandName === "admin") {
      assert.equal(calls[0][1].flags, discord.MessageFlags.Ephemeral);
      assert.equal(calls[1][1].components[0].components[0].data.custom_id, "delete_guild#initiator");
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
      addShipCheck: async () => true,
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
    isChatInputCommand: () => true,
    options: { getAttachment: () => ({ url: `http://127.0.0.1:${server.address().port}/`, size: metadataSize }) },
  };
  try {
    metadataSize = limits.MAX_IMPORT_BYTES + 1;
    await ImportCommand(message);
    assert.equal(requests, 0);
    assert.match(replies.at(-1), /too large/);
    metadataSize = 1;
    body = " ".repeat(limits.MAX_IMPORT_BYTES + 1);
    await ImportCommand(message);
    assert.equal(writes, 0);
    assert.match(replies.at(-1), /Error:/);
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
    body = JSON.stringify([{ name: "Avenger", type: "ship" }, ...Array.from({ length: 3000 }, () => ({ name: "Paint", type: "paint" }))]);
    await ImportCommand(message);
    assert.equal(persisted.length, 1);
    assert.match(replies.at(-1), /Importing \*\*1\*\* ships/);
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
  const { Ships, ShipDao, deleteShips } = models;
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
    await Ships.bulkCreate(Array.from({ length: 2999 }, () => ship()));
    const results = await Promise.all([ShipDao.create(ship()), ShipDao.bulkCreate([ship()])]);
    assert.deepEqual(results.sort(), [false, true]);
    assert.equal(await ShipDao.count("quota"), 3000);
    assert.equal(await ShipDao.create(ship()), false);
    assert.equal(await ShipDao.bulkCreate([ship("other"), ship("other")]), true);
    await assert.rejects(ShipDao.bulkCreate([ship("other"), ship("quota")]));
    assert.equal(await ShipDao.count("other"), 2);
    await assert.rejects(ShipDao.bulkCreate([ship("other"), ship("other", "missing-owner")]));
    assert.equal(await ShipDao.count("other"), 2);
    await Ships.destroy({ where: { guildId: "quota" } });
    await Ships.bulkCreate([ship("fleet"), ship("fleet", "victim"), ship("another")]);
    // Use an in-memory catalog; no network, bot session, or personal database.
    // The catalog reader uses fixed upstream URLs; stub that module at load time for the isolated lookup.
    const catalogUtils = loadModule("../built/utils", {
      "node-fetch": async () => ({ json: async () => ({ items: [{ name: "Aegis Avenger Titan", rsiName: "Aegis Avenger Titan", slug: "aegis-avenger-titan", rsiSlug: "aegis-avenger-titan" }] }) }),
      "./handlers/DiscordHandlers": { memberGuildsCache: new Map() },
      "./commands": {},
    });
    await catalogUtils.refreshShipList();
    // deleteShips retains the original utils module; update that module's exported lookup for this fixture.
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
      update: async () => {},
    };
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
    await deleteShips("", "owner", "fleet", true);
    assert.equal(await Ships.count({ where: { guildId: "fleet", discordUserId: "victim" } }), 1);
    assert.equal(await Ships.count({ where: { guildId: "another", discordUserId: "owner" } }), 1);
    assert.equal(await Ships.count({ where: { guildId: "fleet", discordUserId: "owner" } }), 0);
    const destroy = Ships.prototype.destroy;
    Ships.prototype.destroy = async () => { throw new Error("fixture write failure"); };
    try {
      await assert.rejects(deleteShips("", "victim", "fleet", true), /fixture write failure/);
    } finally {
      Ships.prototype.destroy = destroy;
    }
  } finally {
    await sequelize.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
});
