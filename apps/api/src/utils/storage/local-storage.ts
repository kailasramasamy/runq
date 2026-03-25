import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { Readable } from 'node:stream';
import type { StorageProvider, UploadParams } from './storage.interface';

const UPLOADS_DIR = join(process.cwd(), 'uploads');

export class LocalStorageProvider implements StorageProvider {
  async upload(params: UploadParams): Promise<string> {
    const key = buildKey(params);
    const fullPath = join(UPLOADS_DIR, key);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, params.data);
    return key;
  }

  async getStream(storageKey: string): Promise<Readable> {
    const fullPath = join(UPLOADS_DIR, storageKey);
    return createReadStream(fullPath);
  }

  async delete(storageKey: string): Promise<void> {
    const fullPath = join(UPLOADS_DIR, storageKey);
    await unlink(fullPath).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'ENOENT') throw err;
    });
  }
}

function buildKey(params: UploadParams): string {
  const ts = Date.now();
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${params.tenantId}/${params.entityType}/${params.entityId}/${ts}-${safeName}`;
}
