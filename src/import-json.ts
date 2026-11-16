import {
  MAX_IMPORT_BYTES,
  MAX_IMPORT_JSON_DEPTH,
  MAX_IMPORT_JSON_TOKENS,
  MAX_IMPORT_RECORDS,
  MAX_IMPORT_STRING_LENGTH,
} from "./shipLimits";

export class ImportJsonLimitError extends Error {}

// Budget the bounded text before JSON.parse can materialize its object graph.
// This scanner handles quoting and structure; JSON.parse still validates grammar.
export function parseImportJson(text: string): unknown {
  if (Buffer.byteLength(text, "utf8") > MAX_IMPORT_BYTES) {
    throw new ImportJsonLimitError(`Import file is too large. Maximum ${MAX_IMPORT_BYTES / (1024 * 1024)} MiB.`);
  }

  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  let stringLength = 0;
  let primitive = false;
  let tokens = 0;
  let records = 0;
  let nextRecord = true;

  const countToken = () => {
    if (++tokens > MAX_IMPORT_JSON_TOKENS) {
      throw new ImportJsonLimitError("Import file is too complex. Export only your ship list and try again.");
    }
    if (stack.length === 1 && stack[0] === "[" && nextRecord) {
      if (++records > MAX_IMPORT_RECORDS) {
        throw new ImportJsonLimitError(`Import file contains too many total entries. Maximum ${MAX_IMPORT_RECORDS.toLocaleString("en-US")}.`);
      }
      nextRecord = false;
    }
  };

  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (inString) {
      if (character === '"' && !escaped) {
        inString = false;
        continue;
      }
      if (++stringLength > MAX_IMPORT_STRING_LENGTH) {
        throw new ImportJsonLimitError("Import contains a text field that is too long. Export only your ship list and try again.");
      }
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      continue;
    }

    if (character === '"') {
      countToken();
      inString = true;
      stringLength = 0;
      primitive = false;
    } else if (character === "[" || character === "{") {
      countToken();
      stack.push(character);
      if (stack.length > MAX_IMPORT_JSON_DEPTH) {
        throw new ImportJsonLimitError("Import file is too complex. Export only your ship list and try again.");
      }
      primitive = false;
    } else if (character === "]" || character === "}") {
      if (stack.pop() !== (character === "]" ? "[" : "{")) {
        throw new SyntaxError("Invalid JSON structure.");
      }
      primitive = false;
    } else if (character === "," || character === ":") {
      if (character === "," && stack.length === 1 && stack[0] === "[") nextRecord = true;
      primitive = false;
    } else if (" \t\r\n".includes(character)) {
      primitive = false;
    } else if (!primitive) {
      countToken();
      primitive = true;
    }
  }

  if (inString || stack.length > 0) throw new SyntaxError("Incomplete JSON.");
  return JSON.parse(text);
}
