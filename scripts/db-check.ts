import { buildDashboardSnapshot, initializeDatabase } from "@/server/db";

initializeDatabase();
console.log(JSON.stringify(buildDashboardSnapshot(), null, 2));
