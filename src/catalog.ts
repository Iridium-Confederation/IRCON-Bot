// Keep only the bounded fields consumed by lookup, inventory and statistics.
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid catalog record.");
  return value as Record<string, unknown>;
}

function text(value: unknown, limit = 100, required = false): string {
  if (value == null && !required) return "";
  if (typeof value !== "string" || value.length > limit || (required && !value.trim())) {
    throw new Error("Invalid catalog text.");
  }
  return value;
}

function amount(value: unknown): number {
  if (value == null) return 0;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid catalog price.");
  return value;
}

function cargoCapacity(value: unknown): number | undefined {
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid catalog cargo.");
  return value;
}

function link(value: unknown): string {
  const input = text(value, 2048);
  if (!input) return "";
  if (/[\s\u0000-\u001f\u007f]/.test(input)) throw new Error("Invalid catalog link.");
  const url = new URL(input);
  const trusted = ["robertsspaceindustries.com", "fleetyards.net"];
  if (url.protocol !== "https:" || url.username || url.password || url.port ||
    !trusted.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
    throw new Error("Untrusted catalog link.");
  }
  // URL serialisation leaves parentheses intact; those delimit Discord links.
  return url.href.replace(/[()[\]<>]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function parseCatalogPage(body: unknown): FleetViewShip[] {
  const items = record(body).items;
  if (!Array.isArray(items) || items.length > 240) throw new Error("Invalid catalog page size.");
  const ships: FleetViewShip[] = [];
  for (const item of items) {
    const source = record(item);
    // The upstream list also contains records without an RSI model name.
    if (source.rsiName == null || source.rsiName === "") continue;
    const metrics = source.metrics == null ? {} : record(source.metrics);
    const loaners = source.loaners == null ? [] : source.loaners;
    if (!Array.isArray(loaners) || loaners.length > 50) throw new Error("Invalid catalog loaners.");
    if (source.onSale != null && typeof source.onSale !== "boolean") throw new Error("Invalid catalog sale status.");
    ships.push({
      id: text(source.id), name: text(source.name, 100, true), rsiName: text(source.rsiName, 100, true),
      slug: text(source.slug, 100, true), rsiSlug: text(source.rsiSlug, 100, true),
      description: text(source.description, 16_000), size: text(source.size),
      metrics: { size: text(metrics.size), sizeLabel: text(metrics.sizeLabel), cargo: cargoCapacity(metrics.cargo) },
      classification: text(source.classification), classificationLabel: text(source.classificationLabel),
      productionStatus: text(source.productionStatus),
      focus: text(source.focus), type: text(source.type),
      storeUrl: link(source.storeUrl), brochure: link(source.brochure),
      price: amount(source.price), pledgePrice: amount(source.pledgePrice), lastPledgePrice: amount(source.lastPledgePrice),
      onSale: source.onSale === true,
      loaners: loaners.map((item) => {
        const loaner = record(item);
        return { slug: text(loaner.slug, 100, true), name: text(loaner.name) };
      }),
    });
  }
  return ships;
}
