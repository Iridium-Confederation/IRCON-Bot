export const MAX_SHIPS_PER_GUILD = 3_000;
export const MAX_SHIPS_PER_MEMBER = 500;

export class MemberShipLimitError extends Error {
  constructor() {
    super(`Member limit reached: each member can store up to ${MAX_SHIPS_PER_MEMBER} ships per server.`);
  }
}

export const MAX_IMPORT_BYTES = 8 * 1024 * 1024;
export const MAX_IMPORT_ENTRIES = MAX_SHIPS_PER_MEMBER;
export const MAX_IMPORT_NAME_LENGTH = 100;
export const MAX_IMPORT_NAME_TOKENS = 6;
