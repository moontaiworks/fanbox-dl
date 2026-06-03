import path from "node:path";

const DEFAULT_COMPONENT_BYTES = 120;
const DEFAULT_PATH_BYTES = 240;
const RESERVED_NAMES = /^(?:AUX|CON|NUL|PRN|COM[1-9]|LPT[1-9])(?:\..*)?$/i;
const RESERVED_PREFIX =
  /^(?:AUX|CON|NUL|PRN|COM[1-9]|LPT[1-9])(?=$|[. <>:"/\\|?*])/i;
const SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export interface SanitizePathComponentOptions {
  maxBytes?: number;
  reserveBytes?: number;
  suffix?: string;
}

export function assertPathBudget(
  absolutePath: string,
  maxBytes = DEFAULT_PATH_BYTES,
): void {
  if (Buffer.byteLength(path.resolve(absolutePath)) > maxBytes) {
    throw new Error(
      `Path exceeds ${maxBytes} byte path budget: ${absolutePath}`,
    );
  }
}

export function createCreatorDirectoryName(
  creatorId: string,
  outputDirectory: string,
): string {
  return sanitizePathComponentForDirectory(creatorId, outputDirectory, {
    reserveBytes: Buffer.byteLength(`${path.sep}manifest.json`),
  });
}

export function createPostDirectoryName(
  post: {
    id: string;
    publishedDatetime: string;
    title: string;
  },
  parentDirectory?: string,
): string {
  const date = post.publishedDatetime.slice(0, 10);
  const prefix = `${date}_${post.id}_`;
  const options = {
    maxBytes: DEFAULT_COMPONENT_BYTES - Buffer.byteLength(prefix),
    reserveBytes: Buffer.byteLength(`${prefix}${path.sep}metadata.json`),
  };
  const title = parentDirectory
    ? sanitizePathComponentForDirectory(post.title, parentDirectory, options)
    : sanitizePathComponent(post.title, options);
  return `${prefix}${title}`;
}

export function sanitizePathComponent(
  value: string,
  options: SanitizePathComponentOptions = {},
): string {
  const maxBytes = options.maxBytes ?? DEFAULT_COMPONENT_BYTES;
  const suffix = options.suffix ?? "";
  let sanitized = Array.from(SEGMENTER.segment(value), ({ segment }) => segment)
    .map((character) => (character.charCodeAt(0) <= 31 ? "_" : character))
    .join("")
    .replaceAll(/[<>:"/\\|?*]/g, "_")
    .replaceAll(/[. ]+$/g, "");
  if (RESERVED_NAMES.test(sanitized) || RESERVED_PREFIX.test(value)) {
    sanitized = `_${sanitized}`;
  }
  if (!sanitized) {
    sanitized = "_";
  }

  const suffixBytes = Buffer.byteLength(suffix);
  return `${truncateUtf8(sanitized, Math.max(0, maxBytes - suffixBytes))}${suffix}`;
}

export function sanitizePathComponentForDirectory(
  value: string,
  directory: string,
  options: SanitizePathComponentOptions = {},
): string {
  const availableBytes =
    DEFAULT_PATH_BYTES -
    Buffer.byteLength(path.resolve(directory)) -
    Buffer.byteLength(path.sep) -
    (options.reserveBytes ?? 0);
  if (availableBytes <= Buffer.byteLength(options.suffix ?? "")) {
    throw new Error(`Directory leaves no room in path budget: ${directory}`);
  }

  return sanitizePathComponent(value, {
    ...options,
    maxBytes: Math.min(
      options.maxBytes ?? DEFAULT_COMPONENT_BYTES,
      availableBytes,
    ),
  });
}

function truncateUtf8(value: string, maxBytes: number): string {
  let result = "";
  for (const { segment: character } of SEGMENTER.segment(value)) {
    if (Buffer.byteLength(result + character) > maxBytes) {
      break;
    }
    result += character;
  }

  return result;
}
