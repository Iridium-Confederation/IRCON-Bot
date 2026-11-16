const assert = require("node:assert/strict");
const test = require("node:test");
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

function loadUtils(client, memberGuildsCache, stubs = {}) {
  return loadModule("../built/utils", {
    "./models/Ships": {}, "./models/User": {}, "./commands": {},
    "./handlers/DiscordHandlers": { client, memberGuildsCache }, ...stubs,
  });
}

test("DM access and targeted card lookups reject revoked cached members without losing other guilds", async () => {
  const client = new Discord.Client({ intents: [] });
  const former = new Discord.Guild(client, { id: "former", name: "Former fleet" });
  const current = new Discord.Guild(client, { id: "current", name: "Current fleet" });
  client.guilds.cache.set(former.id, former);
  client.guilds.cache.set(current.id, current);
  let revoked = false;
  let reads = 0;
  client.rest.get = async (route) => {
    reads++;
    if (revoked && route.includes("/guilds/former/")) throw { code: Discord.RESTJSONErrorCodes.UnknownMember };
    return { user: { id: "owner", username: "Fixture", discriminator: "0", avatar: null },
      joined_at: "2020-01-01T00:00:00.000Z", roles: [], deaf: false, mute: false };
  };
  try {
    // Populate the actual discord.js cache through its public fetch API.
    await former.members.fetch("owner");
    await current.members.fetch("owner");
    assert.equal(former.members.cache.get("owner").partial, false);
    const memberGuildsCache = new Map([["owner", new Set([former.id])]]);
    const replies = [];
    let saves = 0;
    const user = { defaultGuildId: former.id, save: async () => { saves++; } };
    const utils = loadUtils(client, memberGuildsCache, {
      "./models/User": { User: { findById: async () => [user] } },
    });
    const message = { user: { id: "owner" }, inGuild: () => false,
      reply: async (payload) => replies.push(payload) };
    assert.equal(await utils.getGuildId(message), former.id, "current members retain their default guild");
    revoked = true;
    reads = 0;
    assert.equal(await utils.getGuildId(message), current.id);
    assert.equal(reads, 2, "both candidate memberships must be checked against Discord despite populated caches");
    assert.equal(user.defaultGuildId, null);
    assert.equal(saves, 1);
    assert.equal(replies.length, 1);
    assert.equal(memberGuildsCache.has("owner"), false);
    assert.equal(former.members.cache.has("owner"), false);
    assert.equal(current.members.cache.has("owner"), true);
    assert.equal((await utils.getUserGuilds(message, former.id)).size, 0,
      "an existing card's explicit guild context must not bypass revocation");
    assert.deepEqual([...(await utils.getUserGuilds(message)).keys()], [current.id]);
  } finally { await client.destroy(); }
});

test("membership failures fail closed without forgetting valid candidates or slowing in-guild checks", async () => {
  const candidates = new Map([["owner", new Set(["guild"])]]);
  const memberCache = new Map([["owner", {}]]);
  let checks = 0;
  const guild = { id: "guild", members: { cache: memberCache, fetch: async () => {
    checks++;
    throw new Error("Discord unavailable");
  } } };
  const utils = loadUtils({ guilds: { cache: new Discord.Collection([[guild.id, guild]]) } }, candidates);
  const dm = { user: { id: "owner" }, inGuild: () => false };
  await assert.rejects(utils.getUserGuilds(dm), /Discord unavailable/);
  assert.deepEqual([...candidates.get("owner")], [guild.id]);
  assert.equal(memberCache.has("owner"), true);
  const inGuild = { ...dm, guild, guildId: guild.id, inGuild: () => true };
  assert.equal((await utils.getUserGuilds(inGuild)).get(guild.id), guild);
  assert.equal(checks, 1, "guild interactions do not need another member REST request");
});

test("member-removal events evict only that guild and remove empty discovery entries", () => {
  const listeners = new Map();
  class FixtureClient { on(event, callback) { listeners.set(event, callback); return this; } }
  const handlers = loadModule("../built/handlers/DiscordHandlers", {
    "discord.js": { ...Discord, Client: FixtureClient },
    "../utils": {}, "../models/User": {}, "../models/Ships": {}, "../commands": {},
    "../commands/fleet-browser": {}, "../logging/logging": {},
    "../../botconfig.json": "fixture-token", "../../admins.json": [],
    "@discordjs/rest": { REST: class { setToken() { return this; } } },
  });
  handlers.memberGuildsCache.set("owner", new Set(["former", "current"]));
  handlers.memberGuildsCache.set("other", new Set(["former"]));
  handlers.registerOnUserUpdate();
  const remove = listeners.get("guildMemberRemove");
  assert.equal(typeof remove, "function");
  remove({ id: "owner", guild: { id: "former" } });
  assert.deepEqual([...handlers.memberGuildsCache.get("owner")], ["current"]);
  assert.deepEqual([...handlers.memberGuildsCache.get("other")], ["former"]);
  remove({ id: "owner", guild: { id: "current" } });
  remove({ id: "uncached", guild: { id: "former" } });
  assert.equal(handlers.memberGuildsCache.has("owner"), false);
});

const injection = "[Trusted](https://evil.invalid)";
const literal = String.raw`\[Trusted\]\(https://evil\.invalid\)`;

test("add, remove and search render catalog and stored labels literally while retaining grouping and quantities", async () => {
  const replies = [];
  const utils = { getGuildId: async () => "guild", getUserId: () => "owner",
    replyTo: (_, text) => replies.push(text), addShip: async () => ({ name: injection }),
    findShip: (name) => name === "catalog" ? { rsiName: injection } : undefined };
  const stubs = {
    "../utils": utils,
    "../models/Ships": {
      deleteShip: async () => ({ rsiName: injection }),
      ShipDao: { findShipsByName: async () => [
        { shipname: "catalog", owner: { discordUserId: "one", lastKnownTag: injection } },
        { shipname: "catalog", owner: { discordUserId: "one", lastKnownTag: injection } },
        { shipname: "Stored *ship*", owner: { discordUserId: "two", lastKnownTag: "Nora#0000" } },
      ] },
    },
  };
  const message = { isChatInputCommand: () => true,
    options: { getString: () => "fixture", getSubcommand: () => "remove" } };
  await loadModule("../built/commands/AddShipCommand", stubs).AddShipCommand(message);
  await loadModule("../built/commands/RemoveShipCommand", stubs).RemoveShipCommand(message);
  await loadModule("../built/commands/SearchCommand", stubs).SearchCommand(message);
  assert.equal(replies[0], `added **${literal}** to your fleet.`);
  assert.equal(replies[1], `Removed **${literal}** from your inventory.`);
  assert.ok(replies[2].includes(`**${literal}**: ${literal} x 2`));
  assert.ok(replies[2].includes(String.raw`**Stored \*ship\***: Nora`));
  assert.equal(replies.some((text) => text.includes(injection)), false);
  utils.addShip = async () => ({ name: "Aurora Mk I" });
  await loadModule("../built/commands/AddShipCommand", stubs).AddShipCommand(message);
  assert.equal(replies.at(-1), "added **Aurora Mk I** to your fleet.");
});

test("default-guild confirmation escapes guild markup and suppresses mention delivery", async () => {
  const updates = [];
  let saves = 0;
  const user = { save: async () => { saves++; } };
  const { DefaultGuildSelect } = loadModule("../built/commands/SetCommand", {
    "../utils": { getUserId: () => "owner" },
    "../models/User": { User: { findById: async () => [user] } },
    "../handlers/DiscordHandlers": { client: { guilds: {
      cache: new Discord.Collection([["guild", { id: "guild", name: `${injection} @everyone` }]]),
    } } },
  });
  await DefaultGuildSelect({ values: ["guild"], update: async (payload) => updates.push(payload) });
  assert.equal(user.defaultGuildId, "guild");
  assert.equal(saves, 1);
  assert.equal(updates[0].content, `Default guild set to **${literal} @everyone**`);
  assert.deepEqual(updates[0].allowedMentions, { parse: [] });
  assert.deepEqual(updates[0].components, []);
});

test("organization statistics reuse loaded owners while preserving nickname preference and escaped fallback tags", async () => {
  const replies = [];
  const owners = [{ discordUserId: "nick", lastKnownTag: "Stored name#0000" },
    { discordUserId: "tag", lastKnownTag: injection }];
  let ownerReads = 0;
  const { StatsCommand } = loadModule("../built/commands/StatsCommand", {
    "../utils": { getGuildId: async () => "guild", getTotalUsd: () => 0,
      getUserGuilds: async () => new Map([["guild", { name: "Fixture" }]]),
      getGuildUser: async (id) => id === "nick" ? { nickname: "Current Nick" } : undefined,
      replyTo: (_, text) => replies.push(text) },
    "../models/Ships": { ShipDao: { findAll: async () => [
      { owner: owners[0] }, { owner: owners[0] }, { owner: owners[1] },
    ] } },
    "../models/User": { User: { findById: async (id) => {
      ownerReads++;
      return owners.filter((owner) => owner.discordUserId === id);
    } } },
  });
  await StatsCommand({ isChatInputCommand: () => true, options: { getString: () => null } });
  assert.equal(ownerReads, 0, "the fleet query already loaded every contributor's User record");
  assert.ok(replies[0].includes("**3** ships contributed by **2** owners"));
  assert.equal(replies[0].split("Current Nick").length - 1, 1);
  assert.ok(replies[0].includes(literal));
  assert.equal(replies[0].includes("Stored name"), false);
  assert.equal(replies[0].includes(injection), false);
});
