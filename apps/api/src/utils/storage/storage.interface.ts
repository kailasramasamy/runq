import { Readable } from 'node:stream';

export interface UploadParams {
  tenantId: string;
  entityType: string;
  entityId: string;
  fileName: string;
  mimeType: string;
  data: Buffer;
}

export interface StorageProvider {
  upload(params: UploadParams): Promise<string>;
  getStream(storageKey: string): Promise<Readable>;
  delete(storageKey: string): Promise<void>;
}
