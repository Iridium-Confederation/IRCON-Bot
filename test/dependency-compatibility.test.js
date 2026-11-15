const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const execFile = require("node:util").promisify(require("node:child_process").execFile);

test("Sequelize UUID defaults and transaction rollback work with the UUID override", async () => {
  const { Sequelize, DataTypes } = require("sequelize");
  const sequelize = new Sequelize("sqlite::memory:", { logging: false });
  try {
    const Fixture = sequelize.define("UuidFixture", {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      timeId: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV1 },
    });
    await sequelize.sync();
    const retained = await Fixture.create({});
    assert.match(retained.id, /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
    assert.match(retained.timeId, /^[\da-f]{8}-[\da-f]{4}-1[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
    await assert.rejects(sequelize.transaction(async (transaction) => {
      const pending = await Fixture.create({}, { transaction });
      assert.notEqual(pending.id, retained.id);
      throw new Error("rollback fixture");
    }), /rollback fixture/);
    assert.equal(await Fixture.count(), 1);
    assert.equal((await Fixture.findByPk(retained.id)).timeId, retained.timeId);
  } finally {
    await sequelize.close();
  }
});

test("SQLite build cache can verify and clear content with the glob override", async () => {
  const cacache = require("cacache");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "iridium-cache-test-"));
  try {
    await cacache.put(directory, "native-build", "fixture content");
    await cacache.put(directory, "headers", "fixture headers");
    await cacache.verify(directory);
    assert.equal((await cacache.get(directory, "native-build")).data.toString(), "fixture content");
    assert.equal((await cacache.get(directory, "headers")).data.toString(), "fixture headers");
    await cacache.rm.all(directory);
    assert.equal(await cacache.get.info(directory, "native-build"), null);
    assert.deepEqual(await cacache.ls(directory), {});
    await cacache.put(directory, "native-build", "fresh content");
    assert.equal((await cacache.get(directory, "native-build")).data.toString(), "fresh content");
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("migration formatter expands file globs and respects EditorConfig with patched dependencies", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "iridium-formatter-test-"));
  try {
    await fs.writeFile(path.join(directory, ".editorconfig"), "root = true\n\n[*.js]\nindent_style = space\nindent_size = 2\n");
    for (const name of ["one", "two"]) {
      await fs.writeFile(path.join(directory, `${name}.js`), `function ${name}(){return true;}`);
    }
    await execFile(process.execPath, [
      require.resolve("js-beautify/js/bin/js-beautify.js"),
      "--editorconfig", "--replace", path.join(directory, "*.js"),
    ], { cwd: directory });
    for (const name of ["one", "two"]) {
      assert.match(await fs.readFile(path.join(directory, `${name}.js`), "utf8"), /\n {2}return true;/);
    }
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
