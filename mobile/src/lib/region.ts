/**
 * Where the backend lives.
 *
 * Callables are addressed by region, so the client has to name the same one
 * the functions are deployed to. It is written once, here, rather than in
 * every module that reaches for a callable.
 *
 * This has to match REGION in functions/src/config.ts, which in turn has to
 * match the Firestore database's own location — that is fixed when the
 * database is created and cannot be changed afterwards.
 */

import { getFunctions, type Functions } from "firebase/functions";

import { app } from "./firebase";

export const FUNCTIONS_REGION = "asia-south2";

let cached: Functions | null = null;

export function appFunctions(): Functions {
  if (!cached) cached = getFunctions(app, FUNCTIONS_REGION);
  return cached;
}
