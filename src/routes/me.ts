import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";

import { ErrorSchema, GetMeResponseSchema } from "../schemas/index.js";
import { auth } from "../lib/auth.js";
import { GetUserTrainData } from "../usecases/GetUserTrainData.js";

export const meRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "GET",
    url: "/me",
    schema: {
      tags: ["me"],
      summary: "Retorna dados de treino do usuário autenticado",
      response: {
        200: GetMeResponseSchema,
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
        const getUserTrainData = new GetUserTrainData();
        const result = await getUserTrainData.execute({
          userId: session.user.id,
        });
        return reply.status(200).send(result);
      } catch (error) {
        app.log.error(error);
        return reply.status(500).send({
          error: "Internal server error",
          code: "INTERNAL_SERVER_ERROR",
        });
      }
    },
  });
};
