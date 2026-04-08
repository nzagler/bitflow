import { initializeDatabase } from "@/server/db";
import { startAutomation } from "@/server/services/automation";

let initialized = false;

export async function initializeApplication() {
  if (initialized) {
    return;
  }

  initializeDatabase();
  await startAutomation();
  initialized = true;
}
