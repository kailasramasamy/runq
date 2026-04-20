import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { rbacHook } from '../../hooks/rbac';
import { chat } from './agent.service';

const ALL_ROLES = ['owner', 'accountant', 'viewer'] as const;

const chatBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(50),
});

export const agentRoutes: FastifyPluginAsync = async (app) => {
  app.post(
    '/chat',
    { preHandler: [rbacHook([...ALL_ROLES])] },
    async (request, reply) => {
      const { messages } = chatBodySchema.parse(request.body);

      // Set SSE headers
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable reverse proxy buffering
      });

      try {
        for await (const event of chat(messages, request.server.db, request.tenantId)) {
          const data = JSON.stringify(event);
          reply.raw.write(`data: ${data}\n\n`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Internal error';
        const errorEvent = JSON.stringify({ type: 'error', message });
        reply.raw.write(`data: ${errorEvent}\n\n`);
      }

      reply.raw.end();
      return reply;
    },
  );
};
