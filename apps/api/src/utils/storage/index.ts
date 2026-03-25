import type { StorageProvider } from './storage.interface';
import { LocalStorageProvider } from './local-storage';

export type { StorageProvider } from './storage.interface';

let instance: StorageProvider | null = null;

export function getStorageProvider(): StorageProvider {
  if (!instance) {
    instance = new LocalStorageProvider();
  }
  return instance;
}
