import { basename, dirname, join, resolve } from "node:path";

import type { Post } from "../../client/types.js";

export interface FilenameSegment {
  context: string;
  required: boolean;
}

interface PathManagerOptions {
  flatParentMinBytes?: number;
  flatPosts: boolean;
  maxFilenameBytes?: number;
  nameSegments?: FilenameSegment[];
  rootPath: string;
}

// eslint-disable-next-line no-control-regex
const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/g;
const DEFAULT_MAX_FILENAME_BYTES = 250;
const TEMP_FILE_SUFFIX = ".part";
const TRUNCATED_MARKER = "⋯";

export class PathManager {
  name: string;
  path: string;
  #flatParentMinBytes: number;
  #flatPosts: boolean;
  #maxFilenameBytes: number;
  #nameSegments: FilenameSegment[];

  constructor({
    flatParentMinBytes = Buffer.byteLength(TRUNCATED_MARKER),
    flatPosts,
    maxFilenameBytes = DEFAULT_MAX_FILENAME_BYTES,
    nameSegments,
    rootPath,
  }: PathManagerOptions) {
    this.path = resolve(rootPath);
    this.#flatParentMinBytes = flatParentMinBytes;
    this.#flatPosts = flatPosts;
    this.#maxFilenameBytes = maxFilenameBytes;
    this.name = basename(this.path);
    this.#nameSegments = nameSegments ?? [
      { context: this.name, required: true },
    ];
  }

  asset(segments: FilenameSegment[], extension: string) {
    const sanitizedSegments = segments.map(({ context, required }) => ({
      context: context.replace(INVALID_FILENAME_CHARS, "-"),
      required,
    }));
    const maxFinalFilenameBytes =
      this.#maxFilenameBytes - Buffer.byteLength(TEMP_FILE_SUFFIX);

    if (this.#flatPosts) {
      const parent = dirname(this.path);
      const fullname = formatFlatAssetFilename(
        this.#nameSegments,
        sanitizedSegments,
        extension,
        maxFinalFilenameBytes,
        this.#flatParentMinBytes,
      );

      return join(parent, fullname);
    }

    return join(
      this.path,
      formatAssetFilename(sanitizedSegments, extension, maxFinalFilenameBytes),
    );
  }

  dir(segments: FilenameSegment[]) {
    const sanitizedSegments = sanitizeSegments(segments);
    const name = formatName(sanitizedSegments, this.#maxFilenameBytes);

    return new PathManager({
      flatParentMinBytes: this.#flatParentMinBytes,
      flatPosts: this.#flatPosts,
      maxFilenameBytes: this.#maxFilenameBytes,
      nameSegments: sanitizedSegments,
      rootPath: join(this.path, name),
    });
  }

  file(name: string) {
    return join(this.path, name);
  }

  post(post: Pick<Post, "id" | "publishedDatetime" | "title">) {
    const date = post.publishedDatetime.split("T")[0];
    return this.dir([
      { context: date, required: true },
      { context: post.id, required: true },
      { context: post.title, required: false },
    ]);
  }
}

function formatAssetFilename(
  segments: FilenameSegment[],
  extension: string,
  maxBytes: number,
) {
  const suffix = `.${extension}`;
  return `${formatSegments(segments, maxBytes - Buffer.byteLength(suffix)).join(
    "-",
  )}${suffix}`;
}

function formatFlatAssetFilename(
  postNameSegments: FilenameSegment[],
  segments: FilenameSegment[],
  extension: string,
  maxBytes: number,
  flatParentMinBytes: number,
) {
  const fileName = formatAssetFilename(segments, extension, maxBytes);
  const postName = formatName(postNameSegments, maxBytes);
  const candidate = `${postName}.${fileName}`;
  if (Buffer.byteLength(candidate) <= maxBytes) return candidate;

  const separatorBytes = Buffer.byteLength(".");
  const minimumPostNameBytes = Math.min(
    Buffer.byteLength(postName),
    minimumSegmentsBytes(postNameSegments, flatParentMinBytes),
  );
  const fileNameBytes = maxBytes - separatorBytes - minimumPostNameBytes;
  const truncatedFileName = formatAssetFilename(
    segments,
    extension,
    fileNameBytes,
  );
  const postNameBytes =
    maxBytes - separatorBytes - Buffer.byteLength(truncatedFileName);

  return `${formatName(postNameSegments, postNameBytes)}.${truncatedFileName}`;
}

function formatName(segments: FilenameSegment[], maxBytes: number) {
  return formatSegments(segments, maxBytes).join("-");
}

function formatSegments(segments: FilenameSegment[], maxBytes: number) {
  const separator = "-";
  const separatorBytes =
    Math.max(segments.length - 1, 0) * Buffer.byteLength(separator);
  const requiredBytes = segments.reduce(
    (total, segment) =>
      segment.required ? total + Buffer.byteLength(segment.context) : total,
    separatorBytes,
  );
  let optionalBytes = maxBytes - requiredBytes;
  return segments.map((segment) => {
    if (segment.required) return segment.context;

    const formatted = truncateUtf8(segment.context, optionalBytes);
    optionalBytes -= Buffer.byteLength(formatted);

    return formatted;
  });
}

function minimumSegmentsBytes(
  segments: FilenameSegment[],
  optionalSegmentBytes: number,
) {
  if (!segments.length) return 0;

  const separatorBytes =
    Math.max(segments.length - 1, 0) * Buffer.byteLength("-");
  const optionalBytes = segments.reduce(
    (total, segment) =>
      segment.required ? total : total + Buffer.byteLength(segment.context),
    0,
  );

  return segments.reduce(
    (total, segment) =>
      segment.required ? total + Buffer.byteLength(segment.context) : total,
    separatorBytes + Math.min(optionalBytes, optionalSegmentBytes),
  );
}

function sanitizeSegments(segments: FilenameSegment[]) {
  return segments.map(({ context, required }) => ({
    context: context.replace(INVALID_FILENAME_CHARS, "-"),
    required,
  }));
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
