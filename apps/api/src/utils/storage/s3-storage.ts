import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { NotFoundError } from '../errors';
import type { StorageProvider, UploadParams } from './storage.interface';

export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET!;
    this.client = new S3Client({
      region: process.env.AWS_REGION ?? 'ap-south-1',
      ...(process.env.S3_ENDPOINT ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true } : {}),
    });
  }

  async upload(params: UploadParams): Promise<string> {
    const key = buildKey(params);
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: params.data,
      ContentType: params.mimeType,
    }));
    return key;
  }

  /// A key the DB still points at but the bucket no longer holds is a
  /// missing resource, not a server fault — map it to 404 so callers get
  /// the same answer they would from the local provider.
  async getStream(storageKey: string): Promise<Readable> {
    try {
      const response = await this.client.send(new GetObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }));
      return response.Body as Readable;
    } catch (err) {
      const name = (err as { name?: string }).name;
      if (name === 'NoSuchKey' || name === 'NotFound') {
        throw new NotFoundError('File');
      }
      throw err;
    }
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    }));
  }
}

function buildKey(params: UploadParams): string {
  const ts = Date.now();
  const safeName = params.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${params.tenantId}/${params.entityType}/${params.entityId}/${ts}-${safeName}`;
}
