import {
  NotFoundError,
  SessionAlreadyStartedError,
  WorkoutPlanNotActiveError,
} from "../errors/index.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  workoutPlanId: string;
  workoutDayId: string;
}

export interface OutputDto {
  userWorkoutSessionId: string;
}

export class StartWorkoutSession {
  async execute(dto: InputDto): Promise<OutputDto> {
    const plan = await prisma.workoutPlan.findUnique({
      where: { id: dto.workoutPlanId },
      include: {
        workoutDays: {
          where: { id: dto.workoutDayId },
          include: {
            sessions: true,
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

    if (!plan.isActive) {
      throw new WorkoutPlanNotActiveError("Workout plan is not active");
    }

    const day = plan.workoutDays[0];
    if (!day) {
      throw new NotFoundError("Workout day not found");
    }

    const hasStartedSession = day.sessions.length > 0;
    if (hasStartedSession) {
      throw new SessionAlreadyStartedError(
        "A session has already been started for this day",
      );
    }

    const session = await prisma.workoutSession.create({
      data: {
        id: crypto.randomUUID(),
        workoutDayId: dto.workoutDayId,
        startedAt: new Date(),
      },
    });

    return {
      userWorkoutSessionId: session.id,
    };
  }
}
