import { betterAuth } from "better-auth";
import { dash } from "@better-auth/infra";

import { env } from "@/lib/env";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  plugins: [
    dash({
      apiKey: env.BETTER_AUTH_API_KEY,
    }),
  ],
});
