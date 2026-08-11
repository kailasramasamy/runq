import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { Readable } from 'node:stream';
import { NotFoundError } from '../errors';
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

  /// Existence is checked up-front rather than left to the stream. A
  /// `createReadStream` on a missing path emits ENOENT *asynchronously*,
  /// by which point the reply is already streaming — Fastify then tries
  /// to serialise the error body onto an in-flight response and turns a
  /// plain missing file into `FST_ERR_REP_INVALID_PAYLOAD_TYPE` (a 500
  /// with a stack trace). Failing before the send keeps it an honest 404.
  async getStream(storageKey: string): Promise<Readable> {
    const fullPath = join(UPLOADS_DIR, storageKey);
    try {
      await stat(fullPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundError('File');
      }
      throw err;
    }
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
