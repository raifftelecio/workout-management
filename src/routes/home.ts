import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { auth } from "../lib/auth.js";
import {
  ErrorSchema,
  GetHomeParamsSchema,
  GetHomeResponseSchema,
} from "../schemas/index.js";
import {
  GetHomeData,
  type OutputDto as GetHomeOutputDto,
} from "../usecases/GetHomeData.js";

export const homeRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/:date",
    schema: {
      tags: ["home"],
      summary: "Dados da página inicial do usuário",
      params: GetHomeParamsSchema,
      response: {
        200: GetHomeResponseSchema,
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
        const getHomeData = new GetHomeData();
        const result: GetHomeOutputDto = await getHomeData.execute({
          userId: session.user.id,
          date: request.params.date,
        });
        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);
        if (error instanceof Error && error.message === "Invalid date format") {
          return reply.status(400).send({
            error: error.message,
            code: "INVALID_DATE",
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
