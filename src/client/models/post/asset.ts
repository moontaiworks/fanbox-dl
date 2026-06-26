export interface PostFile {
  extension: string;
  id: string;
  name: string;
  size: number;
  url: string;
}

export interface PostImage {
  extension: string;
  height: number;
  id: string;
  originalUrl: string;
  thumbnailUrl: string;
  width: number;
}
