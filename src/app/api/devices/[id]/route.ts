import { ok, handleApiError, readJson } from "@/server/api";
import { deleteDevice, updateDevice } from "@/server/db";
import { deviceSchema } from "@/server/validation";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const input = deviceSchema.parse(await readJson(request));
    return ok(updateDevice(Number(params.id), input));
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    deleteDevice(Number(params.id));
    return ok({ deleted: true });
  } catch (error) {
    return handleApiError(error);
  }
}
