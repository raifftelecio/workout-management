import dayjs from "dayjs";

import type { WeekDay } from "../generated/prisma/enums.js";
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
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

export interface ConsistencyDayDto {
  workoutDayCompleted: boolean;
  workoutDayStarted: boolean;
}

export interface OutputDto {
  workoutStreak: number;
  consistencyByDay: Record<string, ConsistencyDayDto>;
  completedWorkoutsCount: number;
  conclusionRate: number;
  totalTimeInSeconds: number;
}

export class GetStats {
  async execute(dto: InputDto): Promise<OutputDto> {
    const fromDate = dayjs(dto.from, "YYYY-MM-DD", true);
    const toDate = dayjs(dto.to, "YYYY-MM-DD", true);
    if (!fromDate.isValid() || !toDate.isValid()) {
      throw new Error("Invalid date format");
    }
    if (fromDate.isAfter(toDate)) {
      throw new Error("from must be before or equal to to");
    }

    const rangeStart = fromDate.startOf("day").toDate();
    const rangeEnd = toDate.endOf("day").toDate();

    const sessions = await prisma.workoutSession.findMany({
      where: {
        workoutDay: { workoutPlan: { userId: dto.userId } },
        startedAt: { gte: rangeStart, lte: rangeEnd },
      },
    });

    const consistencyByDay: Record<string, ConsistencyDayDto> = {};
    let completedWorkoutsCount = 0;
    let totalTimeInSeconds = 0;

    for (const session of sessions) {
      const key = dayjs(session.startedAt).format("YYYY-MM-DD");
      if (!consistencyByDay[key]) {
        consistencyByDay[key] = {
          workoutDayCompleted: false,
          workoutDayStarted: false,
        };
      }
      consistencyByDay[key].workoutDayStarted = true;
      if (session.completedAt) {
        consistencyByDay[key].workoutDayCompleted = true;
        completedWorkoutsCount += 1;
        totalTimeInSeconds += dayjs(session.completedAt).diff(
          dayjs(session.startedAt),
          "second",
        );
      }
    }

    const totalSessions = sessions.length;
    const conclusionRate =
      totalSessions === 0 ? 0 : completedWorkoutsCount / totalSessions;

    const activePlan = await prisma.workoutPlan.findFirst({
      where: { userId: dto.userId, isActive: true },
      include: { workoutDays: { select: { weekDay: true } } },
    });
    const planWeekDays = new Set(
      activePlan?.workoutDays.map((d) => d.weekDay) ?? [],
    );

    const completedDatesInRange = new Set(
      sessions
        .filter((s) => s.completedAt != null)
        .map((s) => dayjs(s.startedAt).format("YYYY-MM-DD")),
    );

    let streak = 0;
    let checkDate = toDate;
    while (true) {
      if (checkDate.isBefore(fromDate, "day")) {
        break;
      }
      const dayIndex = checkDate.day();
      const wd = DAY_INDEX_TO_WEEKDAY[dayIndex];
      if (!planWeekDays.has(wd)) {
        checkDate = checkDate.subtract(1, "day");
        continue;
      }
      const key = checkDate.format("YYYY-MM-DD");
      if (!completedDatesInRange.has(key)) {
        break;
      }
      streak += 1;
      checkDate = checkDate.subtract(1, "day");
    }

    return {
      workoutStreak: streak,
      consistencyByDay,
      completedWorkoutsCount,
      conclusionRate,
      totalTimeInSeconds,
    };
  }
}
