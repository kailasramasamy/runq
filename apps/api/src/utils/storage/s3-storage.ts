import { Readable } from 'node:stream';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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

  async getStream(storageKey: string): Promise<Readable> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    }));
    return response.Body as Readable;
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
