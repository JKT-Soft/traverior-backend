import type { FastifyReply } from "fastify";

export function ok(reply: FastifyReply, data: unknown, status = 200) {
  return reply.status(status).send({ ok: true, data });
}

export function fail(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
) {
  return reply.status(status).send({ ok: false, error: { code, message } });
}
