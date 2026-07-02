import { basename, dirname, join, resolve } from "node:path";

import type { Post } from "../../client/types.js";

interface PathManagerOptions {
  flatParentMinBytes?: number;
  flatPosts: boolean;
  maxFilenameBytes?: number;
  rootPath: string;
}

// eslint-disable-next-line no-control-regex
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
const DEFAULT_MAX_FILENAME_BYTES = 250;
const TEMP_FILE_SUFFIX = ".part";
const TRUNCATED_MARKER = "⋯";
const DEFAULT_FLAT_PARENT_MIN_BYTES = Buffer.byteLength(TRUNCATED_MARKER);

export class PathManager {
  name: string;
  path: string;
  #flatParentMinBytes: number;
  #flatPosts: boolean;
  #maxFilenameBytes: number;

  constructor({
    flatParentMinBytes = DEFAULT_FLAT_PARENT_MIN_BYTES,
    flatPosts,
    maxFilenameBytes = DEFAULT_MAX_FILENAME_BYTES,
    rootPath,
  }: PathManagerOptions) {
    this.path = resolve(rootPath);
    this.#flatParentMinBytes = flatParentMinBytes;
    this.#flatPosts = flatPosts;
    this.#maxFilenameBytes = maxFilenameBytes;
    this.name = basename(this.path);
  }

  asset(index: string, name: string, extension: string) {
    const sanitizedName = name.replace(INVALID_FILENAME_CHARS, "-");
    const maxFinalFilenameBytes =
      this.#maxFilenameBytes - Buffer.byteLength(TEMP_FILE_SUFFIX);

    if (this.#flatPosts) {
      const parent = dirname(this.path);
      const fullname = formatFlatAssetFilename(
        this.name,
        index,
        sanitizedName,
        extension,
        maxFinalFilenameBytes,
        this.#flatParentMinBytes,
      );

      return join(parent, fullname);
    }

    return join(
      this.path,
      formatAssetFilename(
        index,
        sanitizedName,
        extension,
        maxFinalFilenameBytes,
      ),
    );
  }

  dir(name: string) {
    return new PathManager({
      flatParentMinBytes: this.#flatParentMinBytes,
      flatPosts: this.#flatPosts,
      maxFilenameBytes: this.#maxFilenameBytes,
      rootPath: join(this.path, name),
    });
  }

  file(name: string) {
    return join(this.path, name);
  }

  post(post: Pick<Post, "id" | "publishedDatetime" | "title">) {
    const date = post.publishedDatetime.split("T")[0];
    const sanitizedTitle = post.title.replace(INVALID_FILENAME_CHARS, "-");
    const title = `${date}-${post.id}-${sanitizedTitle}`;

    return this.dir(title);
  }
}

function formatAssetFilename(
  index: string,
  name: string,
  extension: string,
  maxBytes: number,
) {
  const prefix = `${index}-`;
  const suffix = `.${extension}`;
  const nameBytes =
    maxBytes - Buffer.byteLength(prefix) - Buffer.byteLength(suffix);

  return `${prefix}${truncateUtf8(name, nameBytes)}${suffix}`;
}

function formatFlatAssetFilename(
  postName: string,
  index: string,
  name: string,
  extension: string,
  maxBytes: number,
  flatParentMinBytes: number,
) {
  const fileName = formatAssetFilename(index, name, extension, maxBytes);
  const candidate = `${postName}.${fileName}`;
  if (Buffer.byteLength(candidate) <= maxBytes) return candidate;

  const separatorBytes = Buffer.byteLength(".");
  const minimumPostNameBytes = Math.min(
    Buffer.byteLength(postName),
    flatParentMinBytes,
  );
  const fileNameBytes = maxBytes - separatorBytes - minimumPostNameBytes;
  const truncatedFileName = formatAssetFilename(
    index,
    name,
    extension,
    fileNameBytes,
  );
  const postNameBytes =
    maxBytes - separatorBytes - Buffer.byteLength(truncatedFileName);

  return `${truncateUtf8(postName, postNameBytes)}.${truncatedFileName}`;
}

function truncateUtf8(value: string, maxBytes: number) {
  if (maxBytes <= 0) return "";
  if (Buffer.byteLength(value) <= maxBytes) return value;

  let result = "";
  let bytes = 0;
  const markerBytes = Buffer.byteLength(TRUNCATED_MARKER);
  const contentBytes = maxBytes - markerBytes;
  if (contentBytes < 0) return "";
  if (contentBytes === 0) return TRUNCATED_MARKER;

  for (const char of value) {
    const charBytes = Buffer.byteLength(char);
    if (bytes + charBytes > contentBytes) break;

    result += char;
    bytes += charBytes;
  }

  return `${result}${TRUNCATED_MARKER}`;
}
