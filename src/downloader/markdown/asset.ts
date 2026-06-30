import path from "path/posix";

import type { TextContent } from "../post/content.js";

interface FormatMediaAssetOptions {
  altText?: string;
  assetPath: string;
}

export function formatFileAsset(options: FormatMediaAssetOptions): string {
  const { altText, assetPath } = options;
  const relativePath = path.basename(assetPath);
  return `[${altText ?? relativePath}](${relativePath})`;
}

export function formatImageAsset(options: FormatMediaAssetOptions): string {
  const { altText, assetPath } = options;
  const relativePath = path.basename(assetPath);
  return `![${altText ?? relativePath}](${relativePath})`;
}

export function formatTextContent(textContent: TextContent): string {
  if ("url" in textContent.props) {
    return `[${textContent.text}](${textContent.props.url as string})`;
  }

  return textContent.text;
}
