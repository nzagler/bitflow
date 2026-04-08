import { readJson, ok, handleApiError } from "@/server/api";
import { createDevice, getDevices } from "@/server/db";
import { deviceSchema } from "@/server/validation";

export async function GET() {
  try {
    return ok(getDevices());
  } catch (error) {
    return handleApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const input = deviceSchema.parse(await readJson(request));
    return ok(createDevice(input), 201);
  } catch (error) {
    return handleApiError(error);
  }
}
