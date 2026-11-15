const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { promisify } = require("node:util");
const execFile = promisify(require("node:child_process").execFile);
const { Sequelize } = require("sequelize");

const historicalMigrations = [
  "20200604215326-add-user-table.js",
  "20200605010534-remove-username.js",
  "20240531-add-lastknown-displayname.js",
  "3-add-fleetyards-id.js",
];

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "iridium-migrations-test-"));
  const storage = path.join(directory, "fixture.sqlite");
  const config = path.join(directory, "config.json");
  await fs.writeFile(config, JSON.stringify({ test: { dialect: "sqlite", storage, logging: false } }));
  const db = new Sequelize({ dialect: "sqlite", storage, logging: false });
  t.after(async () => { await db.close(); await fs.rm(directory, { recursive: true, force: true }); });
  return {
    db,
    migrate: () => execFile(process.execPath, [
      require.resolve("sequelize-cli/lib/sequelize"), "db:migrate",
      "--migrations-path", path.resolve(__dirname, "../built/migrations"),
      "--config", config, "--env", "test",
    ]),
  };
}

test("fresh SQLite migrations create usable fleet tables and can run again", async (t) => {
  const { db, migrate } = await fixture(t);
  await migrate();
  const users = await db.getQueryInterface().describeTable("Users");
  const ships = await db.getQueryInterface().describeTable("Ships");
  assert.ok(users.lastKnownDisplayName);
  assert.ok(users.defaultGuildId);
  assert.ok(ships.fleetyardsId);
  await db.query("INSERT INTO Users (discordUserId, lastKnownTag, createdAt, updatedAt) VALUES ('owner', 'fixture', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
  await db.query("INSERT INTO Ships (discordUserId, guildId, shipname, createdAt, updatedAt) VALUES ('owner', 'guild', 'Avenger', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)");
  await assert.rejects(db.query("INSERT INTO Ships (discordUserId, guildId, shipname, createdAt, updatedAt) VALUES ('missing', 'guild', 'Avenger', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"), /FOREIGN KEY/);
  assert.match((await migrate()).stdout, /already up to date/);
  const [rows] = await db.query("SELECT shipname FROM Ships JOIN Users ON Ships.discordUserId = Users.discordUserId");
  assert.deepEqual(rows, [{ shipname: "Avenger" }]);
});

for (const upgraded of [false, true]) {
  test(`migration preserves an existing ${upgraded ? "current" : "older"} SQLite database`, async (t) => {
    const { db, migrate } = await fixture(t);
    // A historical schema with an extra column must not be rebuilt from models.
    await db.query(`CREATE TABLE Users (discordUserId VARCHAR(255) PRIMARY KEY, lastKnownTag VARCHAR(255), legacyNote TEXT${upgraded ? ", lastKnownDisplayName VARCHAR(255)" : ""})`);
    await db.query("CREATE TABLE Ships (id INTEGER PRIMARY KEY AUTOINCREMENT, discordUserId VARCHAR(255), guildId VARCHAR(255), shipname VARCHAR(255))");
    await db.query("CREATE TABLE SequelizeMeta (name VARCHAR(255) PRIMARY KEY)");
    for (const name of historicalMigrations.filter((name) => upgraded || name !== "20240531-add-lastknown-displayname.js")) {
      await db.query("INSERT INTO SequelizeMeta (name) VALUES (?)", { replacements: [name] });
    }
    await db.query("INSERT INTO Users (discordUserId, lastKnownTag, legacyNote) VALUES ('owner', 'fixture', 'retain this')");
    await db.query("INSERT INTO Ships (discordUserId, guildId, shipname) VALUES ('owner', 'guild', 'Avenger')");
    const [beforeShips] = await db.query("SELECT sql FROM sqlite_master WHERE name = 'Ships'");
    await migrate();
    assert.match((await migrate()).stdout, /already up to date/);
    assert.ok((await db.getQueryInterface().describeTable("Users")).lastKnownDisplayName);
    const [rows] = await db.query("SELECT Users.discordUserId, legacyNote, guildId, shipname FROM Users JOIN Ships ON Ships.discordUserId = Users.discordUserId");
    assert.deepEqual(rows, [{ discordUserId: "owner", legacyNote: "retain this", guildId: "guild", shipname: "Avenger" }]);
    assert.deepEqual((await db.query("SELECT sql FROM sqlite_master WHERE name = 'Ships'"))[0], beforeShips);
  });
}
