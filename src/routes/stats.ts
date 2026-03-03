import { fromNodeHeaders } from "better-auth/node";
import dayjs from "dayjs";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { auth } from "../lib/auth.js";
import {
  ErrorSchema,
  GetStatsQuerySchema,
  GetStatsResponseSchema,
} from "../schemas/index.js";
import {
  GetStats,
  type OutputDto as GetStatsOutputDto,
} from "../usecases/GetStats.js";

export const statsRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/",
    schema: {
      tags: ["stats"],
      summary: "Estatísticas de treinos do usuário no período",
      querystring: GetStatsQuerySchema,
      response: {
        200: GetStatsResponseSchema,
        400: ErrorSchema,
        401: ErrorSchema,
        500: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      try {
        const session = await auth.api.getSession({
          headers: fromNodeHeaders(request.headers),
        });
        if (!session) {
          return reply.status(401).send({
            error: "Unautorized",
            code: "UNAUTHORIZED",
          });
        }
        const query = request.query;
        const fromStr =
          typeof query.from === "string"
            ? query.from
            : dayjs(query.from).format("YYYY-MM-DD");
        const toStr =
          typeof query.to === "string"
            ? query.to
            : dayjs(query.to).format("YYYY-MM-DD");
        const getStats = new GetStats();
        const result: GetStatsOutputDto = await getStats.execute({
          userId: session.user.id,
          from: fromStr,
          to: toStr,
        });
        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);
        if (
          error instanceof Error &&
          (error.message === "Invalid date format" ||
            error.message === "from must be before or equal to to")
        ) {
          return reply.status(400).send({
            error: error.message,
            code: "INVALID_REQUEST",
          });
        }
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });
};
