import fp from 'fastify-plugin';
import { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError, ConflictError } from '../utils/errors';

export const errorHandlerPlugin = fp(async (app: FastifyInstance) => {
  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    const pgFriendly = mapPostgresError(error);
    if (pgFriendly) {
      return reply.status(pgFriendly.statusCode).send(pgFriendly);
    }

    if (error instanceof AppError) {
      const body: Record<string, unknown> = {
        statusCode: error.statusCode,
        error: error.name,
        message: error.message,
      };
      // ConflictError carries optional structured details (e.g. duplicate
      // upload id) so the frontend can render an "Open existing" link.
      if (error instanceof ConflictError && error.details) {
        body.details = error.details;
      }
      return reply.status(error.statusCode).send(body);
    }

    if (error instanceof ZodError) {
      return reply.status(400).send({
        statusCode: 400,
        error: 'Validation Error',
        message: 'Invalid request data',
        details: error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      });
    }

    const fastifyError = error as { statusCode?: number; message?: string };
    if (fastifyError.statusCode === 401) {
      return reply.status(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: fastifyError.message || 'Unauthorized',
      });
    }

    // Surface the real error message so 500s are debuggable from the
    // browser. The full stack trace is still only in server logs.
    return reply.status(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  });
});

interface PgError {
  code?: string;
  message?: string;
  detail?: string;
  column?: string;
  column_name?: string;
  table?: string;
  table_name?: string;
  constraint?: string;
  constraint_name?: string;
}

interface FriendlyError {
  statusCode: number;
  error: string;
  message: string;
  field?: string;
  detail?: string;
}

// Translate raw Postgres errors into something a user can act on. Returns
// null when the error isn't a Postgres error so the default handler can
// take over.
function mapPostgresError(err: unknown): FriendlyError | null {
  if (!err || typeof err !== 'object') return null;
  const e = err as PgError;
  const code = e.code;
  if (!code || !/^[0-9A-Z]{5}$/.test(code)) return null;

  const column = humanField(e.column ?? e.column_name);
  const table = humanTable(e.table ?? e.table_name);
  const where = column ? `"${column}"${table ? ` on ${table}` : ''}` : table ?? null;

  switch (code) {
    case '22001': {
      // string_data_right_truncation — Postgres rarely sets column for this.
      // Fish the limit out of the message ("character varying(15)") so the
      // user at least knows how short the field needs to be.
      const m = /character varying\((\d+)\)/.exec(e.message ?? '');
      const limit = m?.[1];
      const subject = where ?? 'One of the fields';
      return {
        statusCode: 400,
        error: 'ValidationError',
        message: limit
          ? `${subject} is too long. Maximum length is ${limit} characters.`
          : `${subject} is too long.`,
        field: column ?? undefined,
      };
    }
    case '23502':
      return {
        statusCode: 400,
        error: 'ValidationError',
        message: column
          ? `"${column}" is required.`
          : 'A required field is missing.',
        field: column ?? undefined,
      };
    case '23505':
      return {
        statusCode: 409,
        error: 'ConflictError',
        message: column
          ? `A record with this "${column}" already exists.`
          : 'A duplicate record already exists.',
        field: column ?? undefined,
      };
    case '23503':
      return {
        statusCode: 409,
        error: 'ConflictError',
        message: 'This record is referenced elsewhere and cannot be saved as-is.',
      };
    case '23514':
      return {
        statusCode: 400,
        error: 'ValidationError',
        message: column
          ? `"${column}" has an invalid value.`
          : 'A field has an invalid value.',
        field: column ?? undefined,
      };
    case '22P02': {
      // invalid_text_representation — Postgres puts the offending value and
      // target type in the message ("invalid input syntax for type uuid: ..."),
      // never in `column`. Surface that so the bad field is identifiable.
      const m = /invalid input syntax for type (\w+)/.exec(e.message ?? '');
      const target = m?.[1];
      return {
        statusCode: 400,
        error: 'ValidationError',
        message: target
          ? `A field has the wrong format for type ${target}.`
          : 'A field has the wrong type or format.',
        ...(e.message ? { detail: e.message } : {}),
      };
    }
    default:
      return null;
  }
}

function humanField(col: string | undefined): string | null {
  if (!col) return null;
  return col.replace(/_/g, ' ');
}

function humanTable(tbl: string | undefined): string | null {
  if (!tbl) return null;
  // "purchase_invoices" → "purchase invoice"
  const noUnderscore = tbl.replace(/_/g, ' ');
  return noUnderscore.endsWith('s') ? noUnderscore.slice(0, -1) : noUnderscore;
}
