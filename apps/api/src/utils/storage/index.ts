import type { StorageProvider } from './storage.interface';

export type { StorageProvider } from './storage.interface';

let instance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!instance) {
    if (process.env.S3_BUCKET) {
      const { S3StorageProvider } = require('./s3-storage') as typeof import('./s3-storage');
      instance = new S3StorageProvider();
    } else {
      const { LocalStorageProvider } = require('./local-storage') as typeof import('./local-storage');
      instance = new LocalStorageProvider();
    }
  }
  return instance;
}
