import dayjs from "dayjs";

import { type WeekDay } from "../generated/prisma/enums.js";
import { prisma } from "../lib/db.js";

const DAY_INDEX_TO_WEEKDAY: WeekDay[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

interface InputDto {
  userId: string;
  date: string; // YYYY-MM-DD
}

export interface TodayWorkoutDayDto {
  workoutPlanId: string;
  id: string;
  name: string;
  isRest: boolean;
  weekDay: WeekDay;
  estimatedDurationInSeconds: number;
  coverImageUrl?: string;
  exercisesCount: number;
}

export interface ConsistencyDayDto {
  workoutDayCompleted: boolean;
  workoutDayStarted: boolean;
}

export interface OutputDto {
  activeWorkoutPlanId: string | null;
  todayWorkoutDay: TodayWorkoutDayDto | null;
  workoutStreak: number;
  consistencyByDay: Record<string, ConsistencyDayDto>;
}

export class GetHomeData {
  async execute(dto: InputDto): Promise<OutputDto> {
    const date = dayjs(dto.date, "YYYY-MM-DD", true);
    if (!date.isValid()) {
      throw new Error("Invalid date format");
    }

    const dayOfWeek = date.day();
    const weekStart = date.subtract(dayOfWeek, "day").startOf("day");
    const weekEnd = date.add(6 - dayOfWeek, "day").endOf("day");

    const activePlan = await prisma.workoutPlan.findFirst({
      where: { userId: dto.userId, isActive: true },
      include: {
        workoutDays: {
          include: {
            exercises: true,
          },
        },
      },
    });

    const weekdayOfDate = date.day() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
    const weekDayEnum = DAY_INDEX_TO_WEEKDAY[weekdayOfDate];
    const todayDay = activePlan?.workoutDays.find(
      (d) => d.weekDay === weekDayEnum,
    );

    const sessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: {
          workoutPlan: { userId: dto.userId },
        },
        startedAt: {
          gte: weekStart.toDate(),
          lte: weekEnd.toDate(),
        },
      },
      include: { workoutDay: true },
    });

    const consistencyByDay: Record<string, ConsistencyDayDto> = {};
    let current = weekStart;
    while (current.isBefore(weekEnd) || current.isSame(weekEnd, "day")) {
      const key = current.format("YYYY-MM-DD");
      consistencyByDay[key] = {
        workoutDayCompleted: false,
        workoutDayStarted: false,
      };
      current = current.add(1, "day");
    }

    for (const session of sessions) {
      const key = dayjs(session.startedAt).format("YYYY-MM-DD");
      if (consistencyByDay[key]) {
        consistencyByDay[key].workoutDayStarted = true;
        if (session.completedAt) {
          consistencyByDay[key].workoutDayCompleted = true;
        }
      }
    }

    const planWeekDays = new Set(
      activePlan?.workoutDays.map((d) => d.weekDay) ?? [],
    );
    const completedDates = await prisma.workoutSession
      .findMany({
        where: {
          workoutDay: { workoutPlan: { userId: dto.userId } },
          completedAt: { not: null },
        },
        select: { startedAt: true },
      })
      .then((rows) =>
        new Set(rows.map((r) => dayjs(r.startedAt).format("YYYY-MM-DD"))),
      );
    let streak = 0;
    let checkDate = date;
    while (true) {
      const dayIndex = checkDate.day();
      const wd = DAY_INDEX_TO_WEEKDAY[dayIndex];
      if (!planWeekDays.has(wd)) {
        checkDate = checkDate.subtract(1, "day");
        continue;
      }
      const key = checkDate.format("YYYY-MM-DD");
      if (!completedDates.has(key)) {
        break;
      }
      streak += 1;
      checkDate = checkDate.subtract(1, "day");
    }

    return {
      activeWorkoutPlanId: activePlan?.id ?? null,
      todayWorkoutDay: todayDay
        ? {
            workoutPlanId: activePlan!.id,
            id: todayDay.id,
            name: todayDay.name,
            isRest: todayDay.isRest,
            weekDay: todayDay.weekDay,
            estimatedDurationInSeconds: todayDay.estimatedDurationInSeconds,
            coverImageUrl: todayDay.coverImageUrl ?? undefined,
            exercisesCount: todayDay.exercises.length,
          }
        : null,
      workoutStreak: streak,
      consistencyByDay,
    };
  }
}
