export type Content = FileContent | ImageContent | TextContent;

interface FileSource {
  extension: string;
  id: string;
  name: string;
  size: number;
  url: string;
}

interface ImageSource {
  extension: string;
  id: string;
  originalUrl: string;
}

export abstract class ContentBasic {
  type: string;
  constructor(payload: { type: string }) {
    this.type = payload.type;
  }
}

export abstract class MediaContent extends ContentBasic {
  extension: string;
  id: string;
  url: string;

  constructor(
    type: string,
    payload: { extension: string; id: string; url: string },
  ) {
    super({ type });
    this.id = payload.id;
    this.url = payload.url;
    this.extension = payload.extension;
  }
}

export class FileContent extends MediaContent {
  name: string;
  size: number;

  constructor({ extension, id, name, size, url }: FileSource) {
    super("file", { extension, id, url });
    this.name = name;
    this.size = size;
  }
}

export class ImageContent extends MediaContent {
  constructor({ extension, id, originalUrl }: ImageSource) {
    super("image", { extension, id, url: originalUrl });
  }
}

export class TextContent<
  T extends { text: string } = { text: string },
> extends ContentBasic {
  props: Omit<T, "text">;
  text: string;

  constructor({ text, ...remains }: T) {
    super({ type: "text" });
    this.text = text;
    this.props = remains;
  }
}
