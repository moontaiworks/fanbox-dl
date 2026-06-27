export type Content = FileContent | ImageContent | TextContent;

export class ContentBasic {
  type: string;
  constructor(payload: { type: string }) {
    this.type = payload.type;
  }
}

class MediaContent extends ContentBasic {
  id: string;
  url: string;

  constructor(type: string, payload: { id: string; url: string }) {
    super({ type });
    this.id = payload.id;
    this.url = payload.url;
  }
}

export class FileContent extends MediaContent {
  constructor(payload: { id: string; url: string }) {
    super("file", payload);
  }
}

export class ImageContent extends MediaContent {
  constructor(payload: { id: string; originalUrl: string }) {
    super("image", { id: payload.id, url: payload.originalUrl });
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
