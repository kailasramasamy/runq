import { eq, and } from 'drizzle-orm';
import { documentAttachments } from '@runq/db';
import type { Db } from '@runq/db';
import type { DocumentAttachment, AttachmentEntityType } from '@runq/types';
import type { StorageProvider } from '../../utils/storage';
import { NotFoundError } from '../../utils/errors';

export class AttachmentService {
  constructor(
    private readonly db: Db,
    private readonly tenantId: string,
    private readonly storage: StorageProvider,
  ) {}

  async upload(params: {
    entityType: AttachmentEntityType;
    entityId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    data: Buffer;
    uploadedBy: string;
  }): Promise<DocumentAttachment> {
    const storageKey = await this.storage.upload({
      tenantId: this.tenantId,
      entityType: params.entityType,
      entityId: params.entityId,
      fileName: params.fileName,
      mimeType: params.mimeType,
      data: params.data,
    });

    const [row] = await this.db
      .insert(documentAttachments)
      .values({
        tenantId: this.tenantId,
        entityType: params.entityType,
        entityId: params.entityId,
        fileName: params.fileName,
        fileSize: params.fileSize,
        mimeType: params.mimeType,
        storageKey,
        uploadedBy: params.uploadedBy,
      })
      .returning();

    return this.toAttachment(row!);
  }

  async listByEntity(
    entityType: AttachmentEntityType,
    entityId: string,
  ): Promise<DocumentAttachment[]> {
    const rows = await this.db
      .select()
      .from(documentAttachments)
      .where(
        and(
          eq(documentAttachments.tenantId, this.tenantId),
          eq(documentAttachments.entityType, entityType),
          eq(documentAttachments.entityId, entityId),
        ),
      )
      .orderBy(documentAttachments.createdAt);

    return rows.map(this.toAttachment);
  }

  async getById(id: string): Promise<DocumentAttachment> {
    const [row] = await this.db
      .select()
      .from(documentAttachments)
      .where(
        and(
          eq(documentAttachments.id, id),
          eq(documentAttachments.tenantId, this.tenantId),
        ),
      )
      .limit(1);

    if (!row) throw new NotFoundError('Attachment');
    return this.toAttachment(row);
  }

  async deleteAttachment(id: string): Promise<void> {
    const attachment = await this.getById(id);
    await this.storage.delete(attachment.storageKey);
    await this.db
      .delete(documentAttachments)
      .where(
        and(
          eq(documentAttachments.id, id),
          eq(documentAttachments.tenantId, this.tenantId),
        ),
      );
  }

  private toAttachment(
    row: typeof documentAttachments.$inferSelect,
  ): DocumentAttachment {
    return {
      id: row.id,
      tenantId: row.tenantId,
      entityType: row.entityType,
      entityId: row.entityId,
      fileName: row.fileName,
      fileSize: row.fileSize,
      mimeType: row.mimeType,
      storageKey: row.storageKey,
      uploadedBy: row.uploadedBy,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
