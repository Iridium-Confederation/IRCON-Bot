const assert = require("node:assert/strict");
const test = require("node:test");
const Module = require("node:module");
const http = require("node:http");
const { gzipSync } = require("node:zlib");
const fetch = require("node-fetch");

const turn = () => new Promise((resolve) => setImmediate(resolve));
const valid = JSON.stringify([{ name: "Avenger" }]);

function loadImporter(options = {}) {
  const target = require.resolve("../built/commands/ImportCommand");
  delete require.cache[target];
  const stubs = {
    "node-fetch": options.fetch || (async () => ({ ok: true,
      text: async () => valid, json: async () => JSON.parse(valid) })),
    "../utils": {
      getGuildId: options.getGuildId || (async (message) => message.fixtureGuild),
      bulkFindShips: (names) => names.map((name) => ({ name })),
      bulkCreateShips: options.write || (async () => true),
      replyTo: (message, text) => { message.replies.push(text); },
    },
  };
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent?.filename === target && Object.hasOwn(stubs, request)) return stubs[request];
    return original.apply(this, arguments);
  };
  try { return require(target).ImportCommand; } finally { Module._load = original; }
}

function message(user = "owner", guild = "guild", url = "https://example.invalid/import") {
  return { user: { id: user }, fixtureGuild: guild, replies: [],
    isChatInputCommand: () => true, options: { getAttachment: () => ({ url, size: 1 }) } };
}

test("import rejects excessive JSON structure before native parsing or inventory writes", async (t) => {
  const cases = [
    "[" + "{},".repeat(50000) + "{}]",
    "[".repeat(33) + "0" + "]".repeat(33),
    "[{" + Array.from({ length: 50001 }, (_, i) => JSON.stringify("key" + i) + ":0").join(",") + "}]",
    JSON.stringify([{ name: "Avenger", notes: "x".repeat(65537) }]),
  ];
  let body;
  let writes = 0;
  const command = loadImporter({ fetch: async () => ({ ok: true,
    text: async () => body, json: async () => JSON.parse(body) }),
    write: async () => { writes++; return true; } });
  let nativeParses = 0;
  const originalParse = JSON.parse;
  t.mock.method(JSON, "parse", (...args) => { nativeParses++; return originalParse(...args); });
  for (body of cases) {
    const request = message();
    await command(request);
    assert.match(request.replies[0], /too (?:many|complex|long)/i);
    assert.equal(nativeParses, 0, "resource limits must run before JSON.parse expands the document");
    assert.equal(writes, 0);
  }
});

test("bounded JSON preserves quoted delimiters, escapes, Unicode and nested metadata", () => {
  const { parseImportJson } = require("../built/import-json");
  const data = [{ name: "Avenger", notes: ['quotes: " [] {}', 'backslash: \\', "🚀", "line\nbreak"],
    metadata: { numbers: [0, -1, 1.5, null, true, false] } }];
  assert.deepEqual(parseImportJson(JSON.stringify(data)), data);
  const encoded = String.raw`[{"na\u006de":"Avenger","notes":"\\\"[]{}","symbol":"\ud83d\ude80"}]`;
  assert.deepEqual(parseImportJson(encoded), JSON.parse(encoded));
  assert.deepEqual(parseImportJson("[]"), []);
  assert.throws(() => parseImportJson('[{"name":"Avenger",}]'), SyntaxError);
  assert.throws(() => parseImportJson('[{"notes":"unterminated\\'), SyntaxError);
});

test("import admission enforces global, user and resolved-server limits without queueing", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let downloads = 0;
  let guildReads = 0;
  const tasks = [];
  const command = loadImporter({ getGuildId: async (request) => { guildReads++; return request.fixtureGuild; },
    fetch: async () => { downloads++; await gate; return { ok: true,
      text: async () => valid, json: async () => JSON.parse(valid) }; } });
  async function rejected(request) {
    let finished = false;
    const pending = command(request).then(() => { finished = true; });
    tasks.push(pending);
    await turn();
    assert.equal(finished, true, "busy requests must receive a response without waiting for an import slot");
    assert.match(request.replies[0], /already.*import|imports are busy/i);
  }
  try {
    tasks.push(command(message("one", "first")));
    await turn();
    const beforeUserConflict = guildReads;
    await rejected(message("one", "second"));
    assert.equal(guildReads, beforeUserConflict, "a user's second import stops before another guild lookup");
    await rejected(message("two", "first"));
    await rejected(message("three", "first"));
    assert.equal(downloads, 1);
    for (const [user, guild] of [["two", "second"], ["three", "third"], ["four", "fourth"]]) {
      tasks.push(command(message(user, guild)));
    }
    await turn();
    assert.equal(downloads, 4);
    const beforeGlobalConflict = guildReads;
    await rejected(message("five", "fifth"));
    assert.equal(guildReads, beforeGlobalConflict);
    assert.equal(downloads, 4);
  } finally {
    release();
    await Promise.allSettled(tasks);
  }
  assert.equal(downloads, 4, "rejected requests must not start automatically later");
  const retry = message("one", "first");
  await command(retry);
  assert.equal(downloads, 5);
  assert.equal(retry.replies[0], "Importing **1** ships.");
});

test("import reservations are atomic while guild resolution is still pending", async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let lookups = 0;
  const tasks = [];
  const command = loadImporter({ getGuildId: async (request) => {
    lookups++;
    await gate;
    return request.fixtureGuild;
  } });
  try {
    tasks.push(command(message("one", "first")));
    const duplicate = message("one", "other");
    tasks.push(command(duplicate));
    await turn();
    assert.equal(lookups, 1);
    assert.match(duplicate.replies[0], /already have an import/);
    for (const id of ["two", "three", "four"]) tasks.push(command(message(id, id)));
    const overflow = message("five", "fifth");
    tasks.push(command(overflow));
    await turn();
    assert.equal(lookups, 4);
    assert.match(overflow.replies[0], /Imports are busy/);
  } finally {
    release();
    await Promise.allSettled(tasks);
  }
});

test("import slots recover after guild, download, syntax, limit and database failures", async () => {
  const { MemberShipLimitError } = require("../built/shipLimits");
  let mode;
  const command = loadImporter({
    getGuildId: async (request) => {
      if (mode === "guild-error") throw new Error("fixture guild failure");
      if (mode === "guild-missing") return null;
      return request.fixtureGuild;
    },
    fetch: async () => {
      if (mode === "download") throw new Error("fixture network failure");
      const body = mode === "syntax" ? "[" : mode === "structure"
        ? "[" + "{},".repeat(50000) + "{}]" : valid;
      return { ok: true, text: async () => body, json: async () => JSON.parse(body) };
    },
    write: async () => {
      if (mode === "database") throw new Error("fixture database failure");
      if (mode === "quota") throw new MemberShipLimitError();
      return true;
    },
  });
  for (mode of ["guild-error", "guild-missing", "download", "syntax", "structure", "database", "quota"]) {
    const request = message();
    if (mode === "guild-error" || mode === "database") await assert.rejects(command(request), /fixture/);
    else await command(request);
    assert.equal(request.replies.some((reply) => reply.startsWith("Importing")), false);
    const failedMode = mode;
    mode = "valid";
    const retry = message();
    await command(retry);
    assert.equal(retry.replies[0], "Importing **1** ships.", failedMode + " must release both reservations");
  }
});

function closeWithin(promise) {
  let timeout;
  return Promise.race([promise, new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error("fixture response was not closed")), 2000);
  })]).finally(() => clearTimeout(timeout));
}

test("download deadline aborts stalled headers and bodies and releases the import slot", async (t) => {
  let deadline;
  const nativeTimeout = global.setTimeout;
  t.mock.method(global, "setTimeout", (fn, ms, ...args) => {
    if (ms === 30000) deadline = fn;
    return nativeTimeout(fn, ms, ...args);
  });
  let started;
  let closed;
  let headers;
  const server = http.createServer((request, response) => {
    if (request.url === "/ok") { response.end(valid); return; }
    closed = new Promise((resolve) => response.once("close", resolve));
    if (request.url === "/body") { response.writeHead(200); response.write("["); }
    started();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const command = loadImporter({ fetch: async (...args) => {
    const response = await fetch(...args);
    if (headers) headers();
    return response;
  } });
  try {
    for (const phase of ["headers", "body"]) {
      let didReceiveHeaders;
      const received = new Promise((resolve) => { didReceiveHeaders = resolve; });
      headers = phase === "body" ? didReceiveHeaders : undefined;
      const seen = new Promise((resolve) => { started = resolve; });
      const request = message("owner", "guild", base + "/" + phase);
      const pending = command(request);
      await seen;
      if (phase === "body") { await received; await turn(); }
      assert.equal(typeof deadline, "function");
      deadline();
      await pending;
      assert.match(request.replies[0], /timed out/i);
      await closeWithin(closed);
      headers = undefined;
      const retry = message("owner", "guild", base + "/ok");
      await command(retry);
      assert.equal(retry.replies[0], "Importing **1** ships.");
    }
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});

test("rejected HTTP bodies, including oversized compressed data, are closed before retry", async () => {
  let closed;
  const oversized = Buffer.alloc(2 * 1024 * 1024 + 1, " ");
  const server = http.createServer((request, response) => {
    if (request.url === "/ok") { response.end(valid); return; }
    closed = new Promise((resolve) => response.once("close", resolve));
    if (request.url === "/status") { response.writeHead(503); response.write("held open"); }
    else if (request.url === "/gzip") {
      response.writeHead(200, { "Content-Encoding": "gzip" }); response.write(gzipSync(oversized));
    } else { response.writeHead(200); response.write(oversized); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const command = loadImporter({ fetch });
  try {
    for (const kind of ["status", "oversized", "gzip"]) {
      const request = message("owner", "guild", base + "/" + kind);
      await command(request);
      assert.match(request.replies[0], kind === "status" ? /status 503/ : /Maximum 2 MiB/);
      await closeWithin(closed);
      const retry = message("owner", "guild", base + "/ok");
      await command(retry);
      assert.equal(retry.replies[0], "Importing **1** ships.");
    }
  } finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
});
