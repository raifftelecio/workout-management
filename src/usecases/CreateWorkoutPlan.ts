import { NotFoundError } from "../errors/index.js";
import { WeekDay } from "../generated/prisma/enums.js";
import type { WorkoutPlanGetPayload } from "../generated/prisma/models/WorkoutPlan.js";
import { prisma } from "../lib/db.js";

type WorkoutPlanWithDays = WorkoutPlanGetPayload<{
  include: { workoutDays: { include: { exercises: true } } };
}>;

// Data Transfer Object
interface InputDto {
  userId: string;
  name: string;
  workoutDays: Array<{
    name: string;
    weekDay: WeekDay;
    isRest: boolean;
    estimatedDurationInSeconds: number;
    coverImageUrl?: string | null;
    exercises: Array<{
      order: number;
      name: string;
      sets: number;
      reps: number;
      restTimeInSeconds: number;
    }>;
  }>;
}

export interface OutputDto {
  id: string;
  name: string;
  workoutDays: Array<{
    id: string;
    name: string;
    weekDay: WeekDay;
    isRest: boolean;
    estimatedDurationInSeconds: number;
    coverImageUrl: string | null;
    exercises: Array<{
      id: string;
      order: number;
      name: string;
      sets: number;
      reps: number;
      restTimeInSeconds: number;
    }>;
  }>;
}

function toOutputDto(result: WorkoutPlanWithDays): OutputDto {
  return {
    id: result.id,
    name: result.name,
    workoutDays: result.workoutDays.map((day) => ({
      id: day.id,
      name: day.name,
      weekDay: day.weekDay,
      isRest: day.isRest,
      estimatedDurationInSeconds: day.estimatedDurationInSeconds,
      coverImageUrl: day.coverImageUrl,
      exercises: day.exercises.map((ex) => ({
        id: ex.id,
        order: ex.order,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        restTimeInSeconds: ex.restTimeInSeconds,
      })),
    })),
  };
}

async function mapResult(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  workoutPlanId: string,
): Promise<WorkoutPlanWithDays | null> {
  return tx.workoutPlan.findUnique({
    where: { id: workoutPlanId },
    include: {
      workoutDays: {
        include: {
          exercises: true,
        },
      },
    },
  });
}

export class CreateWorkoutPlan {
  async execute(dto: InputDto): Promise<OutputDto> {
    const existingWorkoutPlan = await prisma.workoutPlan.findFirst({
      where: {
        isActive: true,
      },
    });
    // Transaction - Atomicidade
    return prisma.$transaction(async (tx) => {
      if (existingWorkoutPlan) {
        await tx.workoutPlan.update({
          where: { id: existingWorkoutPlan.id },
          data: { isActive: false },
        });
      }
      const workoutPlan = await tx.workoutPlan.create({
        data: {
          id: crypto.randomUUID(),
          name: dto.name,
          userId: dto.userId,
          isActive: true,
          workoutDays: {
            create: dto.workoutDays.map((day) => ({
              name: day.name,
              weekDay: day.weekDay,
              isRest: day.isRest,
              estimatedDurationInSeconds: day.estimatedDurationInSeconds,
              coverImageUrl: day.coverImageUrl ?? undefined,
              exercises: {
                create: day.exercises.map((exercise) => ({
                  order: exercise.order,
                  name: exercise.name,
                  sets: exercise.sets,
                  reps: exercise.reps,
                  restTimeInSeconds: exercise.restTimeInSeconds,
                })),
              },
            })),
          },
        },
      });
      const result = await mapResult(tx, workoutPlan.id);
      if (!result) {
        throw new NotFoundError("Workout plan not found");
      }
      return toOutputDto(result);
    });
  }
}
