import { FastifyPluginAsync } from 'fastify';
import type { ZodType } from 'zod';
import { uuidParamSchema } from '@runq/validators';
import { rbacHook } from '../../hooks/rbac';
import { NodeService } from './node.service';
import { NotFoundError } from '../../utils/errors';

const WRITE_ROLES = ['owner', 'accountant'] as const;

type NodeType = 'vmcc' | 'cc' | 'pp';

/**
 * Type-specific write routes for one node type, mounted under its own prefix
 * (/vmccs, /chilling-centres, /processing-plants). `nodeType` is injected from
 * the route — never trusted from the body — and every mutation asserts the
 * target row is actually of this type, so a node can't be edited or deactivated
 * through the wrong resource. Reads stay on the shared /nodes endpoint.
 */
export function typedNodeRoutes(
  nodeType: NodeType,
  createSchema: ZodType,
  updateSchema: ZodType,
): FastifyPluginAsync {
  return async (app) => {
    app.post('/', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request, reply) => {
      const input = createSchema.parse(request.body) as Record<string, unknown>;
      const service = new NodeService(request.server.db, request.tenantId);
      return reply.status(201).send({ data: await service.create({ ...input, nodeType } as never) });
    });

    app.put('/:id', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const input = updateSchema.parse(request.body);
      const service = new NodeService(request.server.db, request.tenantId);
      await assertType(service, id, nodeType);
      return { data: await service.update(id, input as never) };
    });

    app.post('/:id/deactivate', { preHandler: [rbacHook([...WRITE_ROLES])] }, async (request) => {
      const { id } = uuidParamSchema.parse(request.params);
      const service = new NodeService(request.server.db, request.tenantId);
      await assertType(service, id, nodeType);
      return { data: await service.deactivate(id) };
    });
  };
}

/** 404 unless the node exists AND matches the resource's node type. */
async function assertType(service: NodeService, id: string, nodeType: NodeType): Promise<void> {
  const node = await service.getById(id);
  if (node.nodeType !== nodeType) throw new NotFoundError(`No ${nodeType} found with id ${id}`);
}
