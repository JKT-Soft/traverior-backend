import { AppError, UnauthorizedError } from "../../../shared/http/errors.js";

const SIGN_IN_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword";

const CREDENTIAL_ERRORS = new Set([
  "EMAIL_NOT_FOUND",
  "INVALID_PASSWORD",
  "INVALID_LOGIN_CREDENTIALS",
  "INVALID_EMAIL",
  "USER_DISABLED",
]);

export type FirebaseIdToken = {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  email: string;
  localId: string;
  tokenType: "Bearer";
};

type IdentityToolkitSuccess = {
  idToken: string;
  refreshToken: string;
  expiresIn: string;
  email: string;
  localId: string;
};

type IdentityToolkitError = {
  error?: { message?: string };
};

export async function signInWithPassword(input: {
  apiKey: string;
  email: string;
  password: string;
  fetchImpl?: typeof fetch;
}): Promise<FirebaseIdToken> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const url = `${SIGN_IN_URL}?key=${encodeURIComponent(input.apiKey)}`;

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        returnSecureToken: true,
      }),
    });
  } catch {
    throw new AppError(
      502,
      "Could not reach Firebase Identity Toolkit",
      "FIREBASE_SIGNIN_FAILED",
    );
  }

  let payload: IdentityToolkitSuccess & IdentityToolkitError;
  try {
    payload = (await response.json()) as IdentityToolkitSuccess & IdentityToolkitError;
  } catch {
    throw new AppError(502, "Firebase sign-in returned invalid JSON", "FIREBASE_SIGNIN_FAILED");
  }

  const errorMessage = payload.error?.message;
  if (!response.ok || errorMessage || !payload.idToken) {
    const code = errorMessage?.split(":")[0]?.trim() ?? "";
    if (CREDENTIAL_ERRORS.has(code)) {
      throw new UnauthorizedError("Invalid email or password");
    }
    throw new AppError(
      502,
      errorMessage || "Firebase sign-in failed",
      "FIREBASE_SIGNIN_FAILED",
    );
  }

  return {
    idToken: payload.idToken,
    refreshToken: payload.refreshToken,
    expiresIn: payload.expiresIn,
    email: payload.email,
    localId: payload.localId,
    tokenType: "Bearer",
  };
}
