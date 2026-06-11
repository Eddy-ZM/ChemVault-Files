import type { Env } from "../_lib/env";
import { hasRequiredBindings } from "../_lib/env";
import { okJson } from "../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const bindings = hasRequiredBindings(env);
  return okJson({
    status: bindings.d1 && bindings.r2 ? "ready" : "configuration-missing",
    api: "online",
    d1: bindings.d1 ? "online" : "missing",
    r2: bindings.r2 ? "online" : "missing",
    environment: env.ENVIRONMENT || "local",
  });
};
