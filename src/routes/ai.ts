import { openai } from "@ai-sdk/openai";
import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  UIMessage,
} from "ai";
import { fromNodeHeaders } from "better-auth/node";
import { FastifyInstance } from "fastify";
import { ZodTypeProvider } from "fastify-type-provider-zod";
import z from "zod";

import { WeekDay } from "../generated/prisma/enums.js";
import { auth } from "../lib/auth.js";
import { ErrorSchema } from "../schemas/index.js";
import { CreateWorkoutPlan } from "../usecases/CreateWorkoutPlan.js";
import { GetUserTrainData } from "../usecases/GetUserTrainData.js";
import { ListWorkoutPlans } from "../usecases/ListWorkoutPlans.js";
import { UpsertUserTrainData } from "../usecases/UpsertUserTrainData.js";

const SYSTEM_PROMPT = `Você é um personal trainer virtual especialista em montagem de planos de treino. Use um tom amigável, motivador e linguagem simples, sem jargões técnicos. Seu público são pessoas leigas em musculação.

**Regra obrigatória:** SEMPRE chame a tool getUserTrainData antes de qualquer interação com o usuário.

**Se getUserTrainData retornar null (usuário sem dados cadastrados):**
- Pergunte em uma única mensagem, de forma simples e direta: nome, peso (em kg), altura (em cm), idade e percentual de gordura corporal (inteiro 0-100, em que 100 = 100%).
- Ao receber as respostas, chame updateUserTrainData convertendo o peso de kg para gramas (ex.: 70 kg = 70000 gramas).

**Se o usuário já tiver dados:** cumprimente pelo nome.

**Para criar um plano de treino:** pergunte objetivo, quantos dias por semana pode treinar e se tem restrições físicas ou lesões. Poucas perguntas, simples e diretas. Depois monte o plano e chame createWorkoutPlan.

**Estrutura do plano:** O plano DEVE ter exatamente 7 dias (MONDAY a SUNDAY). Dias sem treino: isRest true, exercises [], estimatedDurationInSeconds 0.

**Divisões (splits) por dias disponíveis:**
- 2-3 dias/semana: Full Body ou ABC (A: Peito+Tríceps, B: Costas+Bíceps, C: Pernas+Ombros)
- 4 dias/semana: Upper/Lower (recomendado) ou ABCD (A: Peito+Tríceps, B: Costas+Bíceps, C: Pernas, D: Ombros+Abdômen)
- 5 dias/semana: PPLUL — Push/Pull/Legs + Upper/Lower (superior 3x, inferior 2x/semana)
- 6 dias/semana: PPL 2x — Push/Pull/Legs repetido

**Montagem dos treinos:**
- Músculos sinérgicos juntos (peito+tríceps, costas+bíceps)
- Exercícios compostos primeiro, isoladores depois
- 4 a 8 exercícios por sessão; 3-4 séries; 8-12 reps (hipertrofia) ou 4-6 reps (força)
- Descanso entre séries: 60-90s (hipertrofia), 2-3min (compostos pesados)
- Evitar treinar o mesmo grupo muscular em dias consecutivos
- Nomes descritivos para cada dia (ex: "Superior A - Peito e Costas", "Descanso")

**Imagens de capa (coverImageUrl):** SEMPRE informe coverImageUrl em cada dia de treino.
- Dias superiores (peito, costas, ombros, bíceps, tríceps, push, pull, upper, full body): use uma destas URLs, alternando para variar:
  https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO3y8pQ6GBg8iqe9pP2JrHjwd1nfKtVSQskI0v
  https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOW3fJmqZe4yoUcwvRPQa8kmFprzNiC30hqftL
- Dias inferiores (pernas, glúteos, quadríceps, posterior, panturrilha, legs, lower): use uma destas URLs, alternando:
  https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCOgCHaUgNGronCvXmSzAMs1N3KgLdE5yHT6Ykj
  https://gw8hy3fdcv.ufs.sh/f/ccoBDpLoAPCO85RVu3morROwZk5NPhs1jzH7X8TyEvLUCGxY
- Dias de descanso: use imagem de superior.

Seja sempre breve e objetivo nas respostas.`;

const PostAiBodySchema = z.object({
  messages: z
    .array(z.record(z.string(), z.unknown()))
    .describe("Histórico de mensagens do chat"),
});

export const aiRoutes = async (app: FastifyInstance) => {
  app.withTypeProvider<ZodTypeProvider>().route({
    method: "POST",
    url: "/",
    schema: {
      tags: ["ai"],
      summary: "Chat com personal trainer virtual (streaming)",
      body: PostAiBodySchema,
      response: {
        200: z.any(),
        401: ErrorSchema,
      },
    },
    handler: async (request, reply) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });
      if (!session) {
        return reply.status(401).send({
          error: "Unauthorized",
          code: "UNAUTHORIZED",
        });
      }
      const userId = session.user.id;
      const { messages } = request.body as unknown as { messages: UIMessage[] };
      const result = streamText({
        model: openai("gpt-4o-mini"),
        system: SYSTEM_PROMPT,
        tools: {
          getUserTrainData: tool({
            description:
              "Busca os dados de treino do usuário. Chame SEMPRE antes de qualquer interação.",
            inputSchema: z.object({}),
            execute: async () => {
              const useCase = new GetUserTrainData();
              return useCase.execute({ userId });
            },
          }),
          updateUserTrainData: tool({
            description:
              "Cria ou atualiza os dados de treino do usuário (peso em gramas, altura em cm, idade, % gordura 0-100)",
            inputSchema: z.object({
              weightInGrams: z
                .number()
                .describe("Peso em gramas (ex.: 70000 para 70 kg)"),
              heightInCentimeters: z.number().describe("Altura em centímetros"),
              age: z.number().describe("Idade em anos"),
              bodyFatPercentage: z
                .number()
                .int()
                .min(0)
                .max(100)
                .describe(
                  "Percentual de gordura corporal: inteiro 0-100 (100 representa 100%)",
                ),
            }),
            execute: async (input) => {
              const useCase = new UpsertUserTrainData();
              return useCase.execute({
                userId,
                weightInGrams: input.weightInGrams,
                heightInCentimeters: input.heightInCentimeters,
                age: input.age,
                bodyFatPercentage: input.bodyFatPercentage,
              });
            },
          }),
          getWorkoutPlans: tool({
            description: "Lista os planos de treino do usuário",
            inputSchema: z.object({}),
            execute: async () => {
              const useCase = new ListWorkoutPlans();
              return useCase.execute({ userId });
            },
          }),
          createWorkoutPlan: tool({
            description:
              "Cria um novo plano de treino completo com exatamente 7 dias (MONDAY a SUNDAY)",
            inputSchema: z.object({
              name: z.string().describe("Nome do plano de treino"),
              workoutDays: z
                .array(
                  z.object({
                    name: z
                      .string()
                      .describe("Nome do dia (ex: Peito e Tríceps, Descanso)"),
                    weekDay: z.enum(WeekDay).describe("Dia da semana"),
                    isRest: z
                      .boolean()
                      .describe(
                        "Se é dia de descanso (true) ou treino (false)",
                      ),
                    estimatedDurationInSeconds: z
                      .number()
                      .describe(
                        "Duração estimada em segundos (0 para dias de descanso)",
                      ),
                    coverImageUrl: z
                      .string()
                      .url()
                      .describe(
                        "URL da imagem de capa. Use as URLs de superior ou inferior conforme o foco muscular do dia.",
                      ),
                    exercises: z
                      .array(
                        z.object({
                          order: z
                            .number()
                            .describe("Ordem do exercício no dia"),
                          name: z.string().describe("Nome do exercício"),
                          sets: z.number().describe("Número de séries"),
                          reps: z.number().describe("Número de repetições"),
                          restTimeInSeconds: z
                            .number()
                            .describe(
                              "Tempo de descanso entre séries em segundos",
                            ),
                        }),
                      )
                      .describe(
                        "Lista de exercícios (vazia para dias de descanso)",
                      ),
                  }),
                )
                .describe(
                  "Array com exatamente 7 dias de treino (MONDAY a SUNDAY)",
                ),
            }),
            execute: async (input) => {
              const createWorkoutPlan = new CreateWorkoutPlan();
              return createWorkoutPlan.execute({
                userId,
                name: input.name,
                workoutDays: input.workoutDays,
              });
            },
          }),
        },
        stopWhen: stepCountIs(5),
        messages: await convertToModelMessages(messages),
      });
      const response = result.toUIMessageStreamResponse();
      reply.status(response.status as 200 | 401);
      response.headers.forEach((value, key) => reply.header(key, value));
      return reply.send(response.body);
    },
  });
};
