/**
 * Credentials for the two channels that are not free.
 *
 * They live here rather than beside their adapters because the scheduled job
 * and the callables have to declare them, and a circular import between the
 * adapters and the functions that bind them is not worth the tidiness.
 */

import { defineSecret } from "firebase-functions/params";

export const WHATSAPP_TOKEN = defineSecret("WHATSAPP_TOKEN");
export const WHATSAPP_PHONE_ID = defineSecret("WHATSAPP_PHONE_ID");
export const TEXTBELT_KEY = defineSecret("TEXTBELT_KEY");

