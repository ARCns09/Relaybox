import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";

export interface StoredAttachment { storagePath: string; size: number }

export interface AttachmentStorage {
  put(content: Buffer): Promise<StoredAttachment>;
  get(storagePath: string): Promise<Buffer>;
  delete(storagePath: string): Promise<void>;
}

export class LocalAttachmentStorage implements AttachmentStorage {
  private readonly root: string;

  constructor(root: string) { this.root = resolve(root); }

  async put(content: Buffer): Promise<StoredAttachment> {
    await mkdir(this.root, { recursive: true });
    const storagePath = randomUUID();
    await writeFile(join(this.root, storagePath), content, { flag: "wx", mode: 0o600 });
    return { storagePath, size: content.byteLength };
  }

  async get(storagePath: string): Promise<Buffer> {
    if (!/^[0-9a-f-]{36}$/i.test(storagePath)) throw new Error("Invalid storage key");
    return readFile(join(this.root, storagePath));
  }

  async delete(storagePath: string): Promise<void> {
    if (/^[0-9a-f-]{36}$/i.test(storagePath)) await rm(join(this.root, storagePath), { force: true });
  }
}
