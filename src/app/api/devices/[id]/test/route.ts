import { fail, ok, handleApiError } from "@/server/api";
import { addLog, getDeviceById, markDevicePing } from "@/server/db";
import { pingDeviceOnce } from "@/server/services/automation";

export async function POST(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const device = getDeviceById(Number(params.id));
    if (!device) {
      return fail("Device not found", 404);
    }

    const reachable = await pingDeviceOnce(device.host);
    markDevicePing(device.id, reachable);
    addLog("info", "device_ping_test", `Manual ping test for "${device.name}"`, {
      host: device.host,
      reachable
    });
    return ok({ reachable });
  } catch (error) {
    return handleApiError(error);
  }
}
