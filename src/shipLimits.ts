export const MAX_SHIPS_PER_GUILD = 3_000;
export const MAX_SHIPS_PER_MEMBER = 500;

export class MemberShipLimitError extends Error {
  constructor() {
    super(`Member limit reached: each member can store up to ${MAX_SHIPS_PER_MEMBER} ships per server.`);
  }
}

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ENTRIES = MAX_SHIPS_PER_MEMBER;
export const MAX_IMPORT_NAME_LENGTH = 100;
export const MAX_IMPORT_NAME_TOKENS = 6;

export const MAX_CONCURRENT_IMPORTS = 4;
export const IMPORT_DOWNLOAD_TIMEOUT_MS = 30_000;
// Leave room for ignored paints/other items; the token budget also bounds these.
export const MAX_IMPORT_RECORDS = 50_000;
export const MAX_IMPORT_JSON_DEPTH = 32;
// Count object keys as well as scalar values and containers.
export const MAX_IMPORT_JSON_TOKENS = 100_000;
// Encoded JSON string contents, measured in UTF-16 code units before unescaping.
export const MAX_IMPORT_STRING_LENGTH = 64 * 1024;
