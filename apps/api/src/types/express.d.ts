import type { User } from "@prisma/client";

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-object-type
    interface Request {
      user?: Pick<User, "id" | "username">;
    }
  }
}

export {};
