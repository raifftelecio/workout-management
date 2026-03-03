import { NotFoundError } from "../errors/index.js";
import type { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  workoutPlanId: string;
}

export interface WorkoutDayItemDto {
  id: string;
  weekDay: WeekDay;
  name: string;
  isRest: boolean;
  coverImageUrl?: string;
  estimatedDurationInSeconds: number;
  exercisesCount: number;
}

export interface OutputDto {
  id: string;
  name: string;
  workoutDays: WorkoutDayItemDto[];
}

export class GetWorkoutPlan {
  async execute(dto: InputDto): Promise<OutputDto> {
    const plan = await prisma.workoutPlan.findUnique({
      where: { id: dto.workoutPlanId },
      include: {
        workoutDays: {
          include: {
            _count: { select: { exercises: true } },
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

    return {
      id: plan.id,
      name: plan.name,
      workoutDays: plan.workoutDays.map((day) => ({
        id: day.id,
        weekDay: day.weekDay,
        name: day.name,
        isRest: day.isRest,
        coverImageUrl: day.coverImageUrl ?? undefined,
        estimatedDurationInSeconds: day.estimatedDurationInSeconds,
        exercisesCount: day._count.exercises,
      })),
    };
  }
}
