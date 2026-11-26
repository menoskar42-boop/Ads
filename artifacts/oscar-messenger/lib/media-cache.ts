export type CachedMedia = {
  messageId: string;
  uri: string;
  filename: string;
  contentType: string;
  kind: "image" | "video" | "file";
  sizeBytes: number;
};

type MediaCacheOptions = {
  maxImages?: number;
  maxBytes?: number;
  dispose?: (media: CachedMedia) => void;
};

export class MediaPreviewCache {
  private readonly entries = new Map<string, CachedMedia>();
  private readonly maxImages: number;
  private readonly maxBytes: number;
  private readonly dispose?: (media: CachedMedia) => void;

  constructor(options: MediaCacheOptions = {}) {
    this.maxImages = options.maxImages ?? 50;
    this.maxBytes = options.maxBytes ?? 80 * 1024 * 1024;
    this.dispose = options.dispose;
  }

  get(messageId: string): CachedMedia | undefined {
    const entry = this.entries.get(messageId);
    if (!entry) return undefined;
    this.entries.delete(messageId);
    this.entries.set(messageId, entry);
    return entry;
  }

  set(entry: CachedMedia): void {
    const previous = this.entries.get(entry.messageId);
    if (previous) {
      this.entries.delete(entry.messageId);
      if (previous.uri !== entry.uri) this.dispose?.(previous);
    }
    this.entries.set(entry.messageId, entry);
    this.evictToLimits();
  }

  delete(messageId: string): void {
    const entry = this.entries.get(messageId);
    if (!entry) return;
    this.entries.delete(messageId);
    this.dispose?.(entry);
  }

  clear(): void {
    for (const entry of this.entries.values()) this.dispose?.(entry);
    this.entries.clear();
  }

  private evictToLimits(): void {
    while (this.imageCount() > this.maxImages) {
      const oldestImage = [...this.entries].find(([, entry]) => entry.kind === "image");
      if (!oldestImage) break;
      this.delete(oldestImage[0]);
    }
    while (this.totalBytes() > this.maxBytes && this.entries.size > 0) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.delete(oldest);
    }
  }

  private imageCount(): number {
    let count = 0;
    for (const entry of this.entries.values()) {
      if (entry.kind === "image") count += 1;
    }
    return count;
  }

  private totalBytes(): number {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.sizeBytes;
    return total;
  }
}
