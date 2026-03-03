import dayjs from "dayjs";

import { NotFoundError } from "../errors/index.js";
import type { WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
  workoutPlanId: string;
  workoutDayId: string;
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

export interface SessionItemDto {
  id: string;
  workoutDayId: string;
  startedAt: string;
  completedAt?: string;
}

export interface OutputDto {
  id: string;
  name: string;
  isRest: boolean;
  coverImageUrl?: string;
  estimatedDurationInSeconds: number;
  exercises: ExerciseItemDto[];
  weekDay: WeekDay;
  sessions: SessionItemDto[];
}

export class GetWorkoutDay {
  async execute(dto: InputDto): Promise<OutputDto> {
    const plan = await prisma.workoutPlan.findUnique({
      where: { id: dto.workoutPlanId },
      include: {
        workoutDays: {
          where: { id: dto.workoutDayId },
          include: {
            exercises: true,
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

    const day = plan.workoutDays[0];
    if (!day) {
      throw new NotFoundError("Workout day not found");
    }

    return {
      id: day.id,
      name: day.name,
      isRest: day.isRest,
      coverImageUrl: day.coverImageUrl ?? undefined,
      estimatedDurationInSeconds: day.estimatedDurationInSeconds,
      exercises: day.exercises.map((ex) => ({
        id: ex.id,
        name: ex.name,
        order: ex.order,
        workoutDayId: ex.workoutDayId,
        sets: ex.sets,
        reps: ex.reps,
        restTimeInSeconds: ex.restTimeInSeconds,
      })),
      weekDay: day.weekDay,
      sessions: day.sessions.map((s) => ({
        id: s.id,
        workoutDayId: s.workoutDayId,
        startedAt: dayjs(s.startedAt).format("YYYY-MM-DD"),
        completedAt: s.completedAt
          ? dayjs(s.completedAt).format("YYYY-MM-DD")
          : undefined,
      })),
    };
  }
}
