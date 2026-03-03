import type { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  active?: boolean;
}

export interface ExerciseItemDto {
  id: string;
  name: string;
  order: number;
  workoutDayId: string;
  sets: number;
  reps: number;
  restTimeInSeconds: number;
}

export interface WorkoutDayItemDto {
  id: string;
  name: string;
  weekDay: WeekDay;
  isRest: boolean;
  estimatedDurationInSeconds: number;
  coverImageUrl: string | null;
  exercises: ExerciseItemDto[];
}

export interface OutputDto {
  id: string;
  name: string;
  workoutDays: WorkoutDayItemDto[];
}

export class ListWorkoutPlans {
  async execute(dto: InputDto): Promise<OutputDto[]> {
    const plans = await prisma.workoutPlan.findMany({
      where: {
        userId: dto.userId,
        ...(dto.active !== undefined && { isActive: dto.active }),
      },
      include: {
        workoutDays: {
          include: {
            exercises: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return plans.map((plan) => ({
      id: plan.id,
      name: plan.name,
      workoutDays: plan.workoutDays.map((day) => ({
        id: day.id,
        name: day.name,
        weekDay: day.weekDay,
        isRest: day.isRest,
        estimatedDurationInSeconds: day.estimatedDurationInSeconds,
        coverImageUrl: day.coverImageUrl,
        exercises: day.exercises.map((ex) => ({
          id: ex.id,
          name: ex.name,
          order: ex.order,
          workoutDayId: ex.workoutDayId,
          sets: ex.sets,
          reps: ex.reps,
          restTimeInSeconds: ex.restTimeInSeconds,
        })),
      })),
    }));
  }
}
