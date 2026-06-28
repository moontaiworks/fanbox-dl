import path from "path/posix";

import type { TextContent } from "../post/content.js";

interface FormatMediaAssetOptions {
  altText?: string;
  assetPath: string;
  contentPath: string;
}

export function formatFileAsset(options: FormatMediaAssetOptions): string {
  const { altText, assetPath, contentPath } = options;
  const relativePath = markdownAssetPath(contentPath, assetPath);
  return `[${altText ?? relativePath}](${relativePath})`;
}

export function formatImageAsset(options: FormatMediaAssetOptions): string {
  const { altText, assetPath, contentPath } = options;
  const relativePath = markdownAssetPath(contentPath, assetPath);
  return `![${altText ?? relativePath}](${relativePath})`;
}

export function formatTextContent(textContent: TextContent): string {
  if ("url" in textContent.props) {
    return `[${textContent.text}](${textContent.props.url as string})`;
  }

  return textContent.text;
}

export function markdownAssetPath(
  contentPath: string,
  assetPath: string,
): string {
  const relative = path.relative(path.dirname(contentPath), assetPath);
  return relative || path.basename(assetPath);
}
