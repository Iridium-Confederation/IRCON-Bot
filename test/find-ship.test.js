const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");

const catalog = [
  { name: "Aegis Avenger Titan", rsiName: "Aegis Avenger Titan", rsiSlug: "aegis-avenger-titan", slug: "aegis-avenger-titan" },
  { name: "Model A.B Variant", rsiName: "Model A.B Variant", rsiSlug: "model-a-b-variant", slug: "model-a-b-variant" },
];
const utilsPath = require.resolve("../built/utils");
const load = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "node-fetch") {
    return async () => ({ json: async () => ({ items: catalog }) });
  }
  if (parent.filename === utilsPath) {
    if (request === "./handlers/DiscordHandlers") return { memberGuildsCache: new Map() };
    if (["./models/Ships", "./models/User", "./commands"].includes(request)) return {};
  }
  return load.apply(this, arguments);
};
const { findShip, bulkFindShips, refreshShipList } = require("../built/utils");
Module._load = load;

test("ship lookup treats vehicle input as literal text", async () => {
  await refreshShipList();
  assert.equal(findShip("[["), undefined);
  assert.equal(findShip(".*"), undefined);
  assert.equal(findShip("a.b").name, "Model A.B Variant");
  assert.equal(findShip("axb"), undefined);
  assert.deepEqual(bulkFindShips(["[[", ".*", "Avenger"]).map((s) => s.name), ["Aegis Avenger Titan"]);
});

test("ship lookup retains ordinary name and partial-word matching", async () => {
  await refreshShipList();
  assert.equal(findShip("AEGIS AVENGER TITAN").name, "Aegis Avenger Titan");
  assert.equal(findShip("avenger").name, "Aegis Avenger Titan");
  assert.equal(findShip("  avenger\t").name, "Aegis Avenger Titan");
  assert.equal(findShip("unknown avenger").name, "Aegis Avenger Titan");
  assert.equal(findShip("avenger\ttitan").name, "Aegis Avenger Titan");
  assert.deepEqual(bulkFindShips(["avenger\ttitan"]).map((s) => s.name), ["Aegis Avenger Titan"]);
});

test("ship lookup bounds unknown multi-word searches", { timeout: 2000 }, async () => {
  await refreshShipList();
  const unknownName = Array.from({ length: 30 }, (_, index) => `z${index}`).join(" ");
  assert.equal(findShip(unknownName), undefined);
  assert.equal(findShip(Array.from({ length: 20 }, (_, index) => `z${index}`).join(" ")), undefined);
});
