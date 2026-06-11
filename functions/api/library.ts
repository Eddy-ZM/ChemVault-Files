import type { Env } from "../_lib/env";
import { listLibrary, requireDb } from "../_lib/db";
import { okJson, routeError } from "../_lib/http";

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    return okJson(await listLibrary(requireDb(env.FILES_DB)));
  } catch (error) {
    return routeError(error);
  }
};
