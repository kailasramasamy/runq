import { randomUUID } from 'node:crypto';
import type Redis from 'ioredis';
import type { StorageProvider } from '../../utils/storage';

/**
 * Stages a freshly-uploaded extraction file in S3 + Redis so the user can
 * edit the extracted data over the next 30 minutes and bind the file to a
 * real bill on commit. Avoids re-uploading the file when the two-step
 * extract → review → commit flow is used.
 */

const STAGING_TTL_SECONDS = 30 * 60; // 30 minutes
const TMP_ENTITY_TYPE = '_extraction_tmp';

export interface StagedExtraction {
  storageKey: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  tenantId: string;
}

export class ExtractionStagingService {
  constructor(
    private readonly redis: Redis,
    private readonly storage: StorageProvider,
  ) {}

  /**
   * Upload the buffer to S3 under a tmp prefix and stash metadata in Redis
   * with a TTL. Returns an extractionId the client can later pass to commit.
   */
  async stage(params: {
    tenantId: string;
    fileName: string;
    mimeType: string;
    data: Buffer;
  }): Promise<{ extractionId: string; staged: StagedExtraction }> {
    const extractionId = randomUUID();

    const storageKey = await this.storage.upload({
      tenantId: params.tenantId,
      entityType: TMP_ENTITY_TYPE,
      entityId: extractionId,
      fileName: params.fileName,
      mimeType: params.mimeType,
      data: params.data,
    });

    const staged: StagedExtraction = {
      storageKey,
      fileName: params.fileName,
      fileSize: params.data.length,
      mimeType: params.mimeType,
      tenantId: params.tenantId,
    };

    await this.redis.set(
      this.key(extractionId),
      JSON.stringify(staged),
      'EX',
      STAGING_TTL_SECONDS,
    );

    return { extractionId, staged };
  }

  /**
   * Look up a previously-staged extraction by id, verify tenant, delete the
   * Redis entry. Returns the staged metadata so the caller can bind it to
   * an entity. The S3 object is left in place — caller transfers ownership
   * by inserting a `document_attachments` row pointing to the existing key.
   *
   * Returns null if the staging entry doesn't exist (TTL expired or already
   * claimed). Tenant mismatch throws.
   */
  async claim(extractionId: string, tenantId: string): Promise<StagedExtraction | null> {
    const raw = await this.redis.get(this.key(extractionId));
    if (!raw) return null;

    let parsed: StagedExtraction;
    try {
      parsed = JSON.parse(raw) as StagedExtraction;
    } catch {
      return null;
    }

    if (parsed.tenantId !== tenantId) {
      throw new Error('Extraction belongs to a different tenant');
    }

    await this.redis.del(this.key(extractionId));
    return parsed;
  }

  private key(extractionId: string): string {
    return `extraction:${extractionId}`;
  }
}
