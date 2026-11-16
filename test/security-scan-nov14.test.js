const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");

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
    "./handlers/DiscordHandlers": { client: {}, memberGuildsCache: new Map() }, ...stubs,
  });
}

const ship = { name: "Fixture ship", rsiName: "Fixture ship", slug: "fixture-ship", rsiSlug: "fixture-ship", productionStatus: "flight-ready" };

test("catalog rejects unsafe consumer fields and links atomically, retaining the healthy catalog", async () => {
  let records = [{ ...ship, metrics: { cargo: 64.5 } }];
  const utils = loadUtils({ "node-fetch": async () => ({ ok: true, json: async () => ({ items: records }) }) });
  await utils.refreshShipList();
  const healthy = utils.findShip("Fixture ship");
  assert.equal(healthy.productionStatus, "flight-ready");
  assert.equal(healthy.metrics.cargo, 64.5);
  for (const changed of [
    { rsiSlug: null }, { loaners: {} }, { loaners: [{ name: "No slug" }] },
    { metrics: { sizeLabel: 42 } }, { metrics: { cargo: "64" } }, { metrics: { cargo: -1 } },
    { metrics: { cargo: Infinity } }, { classification: {} }, { productionStatus: {} }, { pledgePrice: "100" },
    { name: "x".repeat(101) }, { storeUrl: "https://robertsspaceindustries.com.evil.invalid/" },
    { brochure: "javascript:alert(1)" },
  ]) {
    records = [{ ...ship, ...changed }];
    await utils.refreshShipList();
    assert.equal(utils.findShip("Fixture ship"), healthy, "invalid records must not replace the healthy catalog");
    assert.doesNotThrow(() => utils.findShip("unknown"));
  }
  records = Array.from({ length: 241 }, () => ship);
  const cold = loadUtils({ "node-fetch": async () => ({ ok: true, json: async () => ({ items: records }) }) });
  await assert.rejects(cold.refreshShipList(), /page size/);
  records = [{ ...ship, brochure: "https://fleetyards.net/brochure.pdf", loaners: [{ slug: "other" }], metrics: null }];
  await utils.refreshShipList();
  assert.equal(utils.findShip("Fixture ship").brochure, records[0].brochure);
  assert.equal(utils.findShip("Fixture ship").loaners[0].slug, "other");
  assert.equal(utils.findShip("Fixture ship").metrics.cargo, undefined);
  records = [{ ...ship, storeUrl: "https://robertsspaceindustries.com/ships/test)[link](https://evil.invalid)" }];
  await utils.refreshShipList();
  assert.equal(/[()[\]]/.test(utils.findShip("Fixture ship").storeUrl), false,
    "a trusted host must not allow a URL path to break out of a Discord link");
});

test("catalog download bounds actual bytes and aborts hung overlapping refreshes", async (t) => {
  const http = require("node:http");
  const fetch = require("node-fetch");
  const server = http.createServer((_, response) => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(" ".repeat(32 * 1024 * 1024 + 1));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const utils = loadUtils({ "node-fetch": (_, options) => fetch(`http://127.0.0.1:${server.address().port}`, options) });
    await assert.rejects(utils.refreshShipList(), /over limit/);
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }

  const originalTimeout = global.setTimeout;
  let expire;
  t.mock.method(global, "setTimeout", (callback, milliseconds, ...args) => {
    if (milliseconds === 60_000) expire = callback;
    return originalTimeout(callback, milliseconds, ...args);
  });
  let requests = 0;
  const utils = loadUtils({ "node-fetch": (_, options) => {
    requests++;
    return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(new Error("fixture aborted"))));
  } });
  const first = utils.refreshShipList();
  const second = utils.refreshShipList();
  assert.equal(first, second, "concurrent refreshes must share one request");
  const rejection = assert.rejects(first, /aborted/);
  expire();
  await rejection;
  assert.equal(requests, 1);
  const retry = utils.refreshShipList();
  const retryRejection = assert.rejects(retry, /aborted/);
  expire();
  await retryRejection;
  assert.equal(requests, 2, "a failed request must release the refresh guard");
});

test("catalog and login startup failures are consumed before background timers start", async (t) => {
  let logins = 0;
  let closes = 0;
  let timers = 0;
  t.mock.method(global, "setInterval", () => { timers++; });
  const errors = [];
  const oldExitCode = process.exitCode;
  try {
    loadModule("../built/app", {
      "./utils": { refreshShipList: async () => { throw new Error("fixture catalog failure"); } },
      "./models/Ships": { ShipDao: { initialize: () => {}, sequelize: { close: async () => { closes++; } } } },
      "./handlers/DiscordHandlers": { login: async () => { logins++; } },
      "./logging/logging": { initializeLogging: () => {}, logger: { info: () => {}, error: (...args) => errors.push(args) } },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(logins, 0);
    assert.equal(closes, 1);
    assert.equal(process.exitCode, 1);
    assert.match(String(errors[0]), /fixture catalog failure/);
    assert.equal(timers, 0);
    loadModule("../built/app", {
      "./utils": { refreshShipList: async () => {} },
      "./models/Ships": { ShipDao: { initialize: () => {}, sequelize: { close: async () => { closes++; } } } },
      "./handlers/DiscordHandlers": {
        registerInteractionHandlers: () => {}, registerRateLimit: () => {}, registerOnReady: () => {},
        registerOnMessage: () => {}, registerOnUserUpdate: () => {},
        login: async () => { logins++; throw new Error("fixture login failure"); },
      },
      "./logging/logging": { initializeLogging: () => {}, logger: { info: () => {}, error: (...args) => errors.push(args) } },
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(logins, 1);
    assert.equal(closes, 2);
    assert.equal(timers, 0, "failed login must allow startup to exit without recurring timers");
    assert.match(String(errors[1]), /fixture login failure/);
  } finally { process.exitCode = oldExitCode; }
});

test("every admin entry point rechecks live ownership and rejects stale or cross-server controls", async () => {
  let ownerId = "owner";
  let reads = 0;
  const deleted = [];
  const replies = [];
  const utils = loadUtils({ "./handlers/DiscordHandlers": { client: { guilds: { fetch: async (options) => {
    assert.equal(options.force, true);
    reads++;
    return { id: options.guild, ownerId };
  } } } } });
  utils.replyTo = (_, text) => replies.push(text);
  const stubs = {
    "../utils": utils,
    "../models/Ships": { ShipDao: {
      clearInventory: async (...args) => { deleted.push(args); return 1; },
      findAll: () => assert.fail("rejected admins must not read inventories"),
      findShipsByOwnerId: async () => [],
    }, Ships: { destroy: async ({ where }) => { deleted.push(where); return 1; } } },
    "../models/User": { User: { findById: async () => [{ discordUserId: "target", lastKnownTag: "Fixture" }] } },
  };
  const admin = loadModule("../built/commands/AdminUsers", stubs);
  const { RemoveAllCommand } = loadModule("../built/commands/RemoveAllCommand", stubs);
  const message = (id = "delegate", customId) => ({
    user: { id }, guildId: "guild", guild: { id: "guild" }, customId, values: ["target"],
    isChatInputCommand: () => true, options: { getUser: () => ({ id: "target" }) },
    reply: async (payload) => replies.push(payload),
    update: async () => {},
  });
  await RemoveAllCommand(message());
  assert.equal(deleted.length, 0, "a delegated non-owner must not delete another member's inventory");
  await admin.AdminClearCommand(message());
  await admin.AdminUsersCommand(message());
  assert.equal(deleted.length, 0);
  await RemoveAllCommand(message("owner"));
  assert.deepEqual(deleted.pop(), ["target", "guild"]);

  const controls = [
    [admin.AdminClearButton, "delete_guild#owner#guild"],
    [admin.AdminUsersDeleteButton, "delete_user_button#target#owner#guild"],
    [admin.AdminUsersSelect, "delete_user_select#owner#guild"],
  ];
  ownerId = "new-owner";
  for (const [handler, id] of controls) await handler(message("owner", id));
  assert.equal(deleted.length, 0, "old owners must lose access to existing controls");
  ownerId = "owner";
  const before = reads;
  for (const [handler, id] of controls) await handler({ ...message("owner", id), guildId: "other-guild" });
  assert.equal(reads, before);
  await admin.AdminClearButton(message("owner", controls[0][1]));
  await admin.AdminUsersDeleteButton(message("owner", controls[1][1]));
  assert.deepEqual(deleted, [{ guildId: "guild" }, { guildId: "guild", discordUserId: "target" }]);
  await RemoveAllCommand({ ...message("owner"), guildId: null });
  assert.equal(deleted.length, 2, "admin operations must not follow a DM default guild");
});

test("statistics render contributor names, fallback tags and supplier prose as literal text", async () => {
  const injection = "[Trusted](https://evil.invalid)";
  let output;
  const { StatsCommand } = loadModule("../built/commands/StatsCommand", {
    "../utils": {
      getGuildId: async () => "guild", getTotalUsd: () => 0,
      getUserGuilds: async () => new Map([["guild", { name: injection }]]),
      getGuildUser: async (id) => id === "nick" ? { nickname: injection } : null,
      replyTo: (_, text) => { output = text; },
      findShip: () => ({ ...ship, description: injection, classification: injection, onSale: false, lastPledgePrice: 10 }),
    },
    "../models/Ships": { ShipDao: { findAll: async () => ["nick", "tag"].map((id) => ({ owner: { discordUserId: id } })) } },
    "../models/User": { User: { findById: async () => [{ lastKnownTag: injection }] } },
  });
  const command = { isChatInputCommand: () => true, options: { getString: () => null } };
  await StatsCommand(command);
  assert.equal(output.includes(injection), false);
  assert.equal(output.split(String.raw`\[Trusted\]\(https://evil\.invalid\)`).length - 1, 3);
  command.options.getString = () => "fixture";
  await StatsCommand(command);
  assert.equal(output.includes(injection), false);
  assert.ok(output.includes(String.raw`\[Trusted\]\(https://evil\.invalid\)`));
});

test("import reports the personal quota without falsely reporting success", async () => {
  const { MemberShipLimitError } = require("../built/shipLimits");
  const replies = [];
  const { ImportCommand } = loadModule("../built/commands/ImportCommand", {
    "node-fetch": async () => ({ ok: true, json: async () => [{ name: "Fixture ship" }] }),
    "../utils": { getGuildId: async () => "guild", bulkFindShips: () => [ship],
      bulkCreateShips: async () => { throw new MemberShipLimitError(); }, replyTo: (_, text) => replies.push(text) },
  });
  await ImportCommand({ isChatInputCommand: () => true, options: { getAttachment: () => ({ url: "https://example.invalid/fixture", size: 1 }) } });
  assert.deepEqual(replies, [new MemberShipLimitError().message]);
});
