import type { IncomingMessage } from "node:http";
import { UnauthorizedError } from "../../../shared/http/errors.js";
import type { AuthProvider, AuthUser } from "../domain/ports.js";

export class AuthService {
  constructor(private readonly provider: AuthProvider) {}

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
}
