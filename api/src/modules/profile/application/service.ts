import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../../../infra/prisma/client.js";
import { NotFoundError } from "../../../shared/http/errors.js";

export type ProfilePreferencesInput = {
  budgetMax?: number | null;
  budgetStyle?: "budget" | "balanced" | "luxury";
  pace?: "relaxed" | "moderate" | "packed";
  dietary?: string[];
  interests?: string[];
  travelWith?: "solo" | "couple" | "family" | "friends" | null;
  avoid?: string[];
  homeCity?: string | null;
  passportCountry?: string | null;
  extra?: Record<string, unknown> | null;
};

export type UpdateProfileInput = {
  displayName?: string | null;
  photoUrl?: string | null;
  locale?: string;
  homeCurrency?: string;
  preferences?: ProfilePreferencesInput;
};

export type ProfileRecord = {
  id: string;
  email: string;
  displayName: string | null;
  photoUrl: string | null;
  locale: string;
  homeCurrency: string;
  createdAt: Date;
  updatedAt: Date;
  preference: {
    budgetMax: Prisma.Decimal | null;
    budgetStyle: "budget" | "balanced" | "luxury";
    pace: "relaxed" | "moderate" | "packed";
    dietary: string[];
    interests: string[];
    travelWith: "solo" | "couple" | "family" | "friends" | null;
    avoid: string[];
    homeCity?: string | null;
    passportCountry?: string | null;
    extra: Prisma.JsonValue | null;
    updatedAt: Date;
  } | null;
};

type ProfileDb = Pick<PrismaClient, "user" | "userPreference">;

const profileInclude = {
  preference: true,
} as const;

function jsonField(value: Record<string, unknown> | null | undefined) {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  return value as Prisma.InputJsonValue;
}

export function serializeProfile(user: ProfileRecord) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    photoUrl: user.photoUrl,
    locale: user.locale,
    homeCurrency: user.homeCurrency,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    preferences: user.preference
      ? {
          budgetMax:
            user.preference.budgetMax != null ? Number(user.preference.budgetMax) : null,
          budgetStyle: user.preference.budgetStyle,
          pace: user.preference.pace,
          dietary: user.preference.dietary,
          interests: user.preference.interests,
          travelWith: user.preference.travelWith,
          avoid: user.preference.avoid,
          homeCity: user.preference.homeCity ?? null,
          passportCountry: user.preference.passportCountry ?? null,
          extra: user.preference.extra,
          updatedAt: user.preference.updatedAt.toISOString(),
        }
      : null,
  };
}

export class ProfileService {
  constructor(private readonly db: ProfileDb = defaultPrisma) {}

  async ensureUser(firebaseUid: string, email: string) {
    return this.db.user.upsert({
      where: { firebaseUid },
      update: { email },
      create: { firebaseUid, email },
      include: profileInclude,
    });
  }

  async getProfile(userId: string) {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      include: profileInclude,
    });
    if (!user) throw new NotFoundError("User not found");
    return serializeProfile(user);
  }

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const userData: Prisma.UserUpdateInput = {};
    if (input.displayName !== undefined) userData.displayName = input.displayName;
    if (input.photoUrl !== undefined) userData.photoUrl = input.photoUrl;
    if (input.locale !== undefined) userData.locale = input.locale;
    if (input.homeCurrency !== undefined) userData.homeCurrency = input.homeCurrency;

    const prefs = input.preferences;
    if (prefs) {
      const preferenceData: Prisma.UserPreferenceUpdateInput = {};
      if (prefs.budgetMax !== undefined) {
        preferenceData.budgetMax = prefs.budgetMax;
      }
      if (prefs.budgetStyle !== undefined) preferenceData.budgetStyle = prefs.budgetStyle;
      if (prefs.pace !== undefined) preferenceData.pace = prefs.pace;
      if (prefs.dietary !== undefined) preferenceData.dietary = prefs.dietary;
      if (prefs.interests !== undefined) preferenceData.interests = prefs.interests;
      if (prefs.travelWith !== undefined) preferenceData.travelWith = prefs.travelWith;
      if (prefs.avoid !== undefined) preferenceData.avoid = prefs.avoid;
      if (prefs.homeCity !== undefined) preferenceData.homeCity = prefs.homeCity;
      if (prefs.passportCountry !== undefined) preferenceData.passportCountry = prefs.passportCountry;
      if (prefs.extra !== undefined) preferenceData.extra = jsonField(prefs.extra);

      if (Object.keys(preferenceData).length > 0) {
        userData.preference = {
          upsert: {
            create: {
              budgetStyle: prefs.budgetStyle ?? "balanced",
              pace: prefs.pace ?? "moderate",
              dietary: prefs.dietary ?? [],
              interests: prefs.interests ?? [],
              avoid: prefs.avoid ?? [],
              ...(prefs.budgetMax !== undefined ? { budgetMax: prefs.budgetMax } : {}),
              ...(prefs.travelWith !== undefined ? { travelWith: prefs.travelWith } : {}),
              ...(prefs.homeCity !== undefined ? { homeCity: prefs.homeCity } : {}),
              ...(prefs.passportCountry !== undefined ? { passportCountry: prefs.passportCountry } : {}),
              ...(prefs.extra !== undefined ? { extra: jsonField(prefs.extra) } : {}),
            },
            update: preferenceData,
          },
        };
      }
    }

    if (Object.keys(userData).length === 0) {
      return this.getProfile(userId);
    }

    const user = await this.db.user.update({
      where: { id: userId },
      data: userData,
      include: profileInclude,
    });

    return serializeProfile(user);
  }
}
