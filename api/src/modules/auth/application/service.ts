import type { IncomingMessage } from "node:http";
import { AppError, NotFoundError, UnauthorizedError, ValidationError } from "../../../shared/http/errors.js";
import type { AuthProvider, AuthUser } from "../domain/ports.js";
import { signInWithPassword, type FirebaseIdToken } from "../infra/identity-toolkit.js";

export type AuthTestLoginConfig = {
  enabled: boolean;
  webApiKey?: string;
  email?: string;
  password?: string;
  fetchImpl?: typeof fetch;
};

export class AuthService {
  constructor(
    private readonly provider: AuthProvider,
    private readonly testLogin: AuthTestLoginConfig = { enabled: false },
  ) {}

  resolve(req: IncomingMessage): Promise<AuthUser | undefined> {
    return this.provider.resolve(req);
  }

  requireUser(user: AuthUser | undefined): AuthUser {
    if (!user) throw new UnauthorizedError();
    return user;
  }

  get providerName(): string {
    return this.provider.name;
  }

  get testLoginEnabled(): boolean {
    return this.testLogin.enabled;
  }

  async issueTestToken(input: { email?: string; password?: string } = {}): Promise<FirebaseIdToken> {
    if (!this.testLogin.enabled) throw new NotFoundError();
    const apiKey = this.testLogin.webApiKey;
    if (!apiKey) {
      throw new AppError(
        503,
        "FIREBASE_WEB_API_KEY is not configured",
        "AUTH_TEST_LOGIN_UNAVAILABLE",
      );
    }
    const email = input.email?.trim() || this.testLogin.email;
    const password = input.password || this.testLogin.password;
    if (!email || !password) {
      throw new ValidationError("email and password are required");
    }
    return signInWithPassword({
      apiKey,
      email,
      password,
      fetchImpl: this.testLogin.fetchImpl,
    });
  }
}
