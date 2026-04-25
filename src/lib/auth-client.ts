import { dashClient } from "@better-auth/infra/client";
import { createAuthClient } from "better-auth/client";
import { adminClient, organizationClient } from "better-auth/client/plugins";

export const authClient = createAuthClient({
  plugins: [adminClient(), organizationClient(), dashClient()],
});
