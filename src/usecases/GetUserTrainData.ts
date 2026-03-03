import { prisma } from "../lib/db.js";

interface InputDto {
  userId: string;
}

export interface OutputDto {
  userId: string;
  userName: string;
  weightInGrams: number;
  heightInCentimeters: number;
  age: number;
  bodyFatPercentage: number; // 1 representa 100%
}

export class GetUserTrainData {
  async execute(dto: InputDto): Promise<OutputDto | null> {
    const user = await prisma.user.findUnique({
      where: { id: dto.userId },
      select: {
        id: true,
        name: true,
        weightInGrams: true,
        heightInCentimeters: true,
        age: true,
        bodyFatPercentage: true,
      },
    });

    if (!user) {
      return null;
    }

    const hasTrainData =
      user.weightInGrams != null ||
      user.heightInCentimeters != null ||
      user.age != null ||
      user.bodyFatPercentage != null;

    if (!hasTrainData) {
      return null;
    }

    return {
      userId: user.id,
      userName: user.name,
      weightInGrams: user.weightInGrams ?? 0,
      heightInCentimeters: user.heightInCentimeters ?? 0,
      age: user.age ?? 0,
      bodyFatPercentage: (user.bodyFatPercentage ?? 0) / 100,
    };
  }
}
