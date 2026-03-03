import { NotFoundError } from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  workoutPlanId: string;
  workoutDayId: string;
  sessionId: string;
  completedAt: Date;
}

export interface OutputDto {
  id: string;
  completedAt: string;
  startedAt: string;
}

export class UpdateWorkoutSession {
  async execute(dto: InputDto): Promise<OutputDto> {
    const plan = await prisma.workoutPlan.findUnique({
      where: { id: dto.workoutPlanId },
      include: {
        workoutDays: {
          where: { id: dto.workoutDayId },
          include: {
            sessions: {
              where: { id: dto.sessionId },
            },
          },
        },
      },
    });

    if (!plan) {
      throw new NotFoundError("Workout plan not found");
    }

    if (plan.userId !== dto.userId) {
      throw new NotFoundError("Workout plan not found");
    }

    const day = plan.workoutDays[0];
    if (!day) {
      throw new NotFoundError("Workout day not found");
    }

    const session = day.sessions[0];
    if (!session) {
      throw new NotFoundError("Workout session not found");
    }

    const updated = await prisma.workoutSession.update({
      where: { id: dto.sessionId },
      data: { completedAt: dto.completedAt },
    });

    return {
      id: updated.id,
      completedAt: updated.completedAt!.toISOString(),
      startedAt: updated.startedAt.toISOString(),
    };
  }
}
