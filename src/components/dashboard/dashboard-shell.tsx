"use client";

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { Activity, Copy, MoonStar, PlayCircle, RefreshCcw, Router, Save, SunMedium, TestTube2, Wifi } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type { AutomationSettings, DashboardSnapshot, DeviceMonitoringSettings, DeviceRecord } from "@/lib/types";
import { bytesPerSecondLabel, cn, formatDateTime } from "@/lib/utils";

type ApiEnvelope<T> = {
  ok: boolean;
  data: T;
  error?: string;
};

type QbForm = DashboardSnapshot["qbittorrent"] & { apiKey: string };
type WebhookForm = DashboardSnapshot["webhook"] & { secret: string };
type DeviceFormState = {
  id?: number;
  name: string;
  host: string;
  enabled: boolean;
};

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    }
  });

  const payload = (await response.json()) as ApiEnvelope<T>;
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload.data;
}

export function DashboardShell() {
  const { theme, setTheme } = useTheme();
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [qbForm, setQbForm] = useState<QbForm | null>(null);
  const [webhookForm, setWebhookForm] = useState<WebhookForm | null>(null);
  const [automationForm, setAutomationForm] = useState<AutomationSettings | null>(null);
  const [monitoringForm, setMonitoringForm] = useState<DeviceMonitoringSettings | null>(null);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [deviceForm, setDeviceForm] = useState<DeviceFormState>({ name: "", host: "", enabled: true });
  const [nowTick, setNowTick] = useState(() => Date.now());

  const refresh = async () => {
    try {
      const data = await api<DashboardSnapshot>("/api/dashboard");
      setSnapshot(data);
      setQbForm((current) =>
        current
          ? current
          : { ...data.qbittorrent, apiKey: "" }
      );
      setWebhookForm((current) =>
        current
          ? current
          : { ...data.webhook, secret: "" }
      );
      setAutomationForm((current) => current ?? data.automation);
      setMonitoringForm((current) => current ?? data.monitoring);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const webhookUrl = useMemo(() => {
    if (!snapshot || typeof window === "undefined") {
      return "";
    }
    return `${window.location.origin}${snapshot.derived.webhookUrlPath}`;
  }, [snapshot]);

  const liveCooldownRemainingSeconds = useMemo(() => {
    if (!snapshot?.derived.cooldownActive) {
      return 0;
    }

    const lastActivityTimes = [snapshot.state.lastWebhookAt, snapshot.state.lastDeviceActivityAt]
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter((value) => !Number.isNaN(value));

    const latestActivityAt = lastActivityTimes.length > 0 ? Math.max(...lastActivityTimes) : null;
    if (!latestActivityAt) {
      return snapshot.derived.cooldownRemainingSeconds;
    }

    const remaining = snapshot.automation.inactivityTimeoutMinutes * 60 - Math.floor((nowTick - latestActivityAt) / 1000);
    return Math.max(0, remaining);
  }, [nowTick, snapshot]);

  const saveSection = async (key: string, url: string, body: unknown) => {
    setSaving(key);
    try {
      await api(url, {
        method: "PUT",
        body: JSON.stringify(body)
      });
      toast.success("Settings saved");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const runAction = async (url: string, method: "POST" | "DELETE" = "POST", body?: unknown, message?: string) => {
    try {
      await api(url, {
        method,
        body: body ? JSON.stringify(body) : undefined
      });
      toast.success(message ?? "Action completed");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  };

  const openDeviceDialog = (device?: DeviceRecord) => {
    setDeviceForm(
      device
        ? { id: device.id, name: device.name, host: device.host, enabled: device.enabled }
        : { name: "", host: "", enabled: true }
    );
    setDeviceDialogOpen(true);
  };

  const submitDevice = async () => {
    try {
      if (deviceForm.id) {
        await api(`/api/devices/${deviceForm.id}`, {
          method: "PUT",
          body: JSON.stringify(deviceForm)
        });
      } else {
        await api("/api/devices", {
          method: "POST",
          body: JSON.stringify(deviceForm)
        });
      }

      toast.success("Device saved");
      setDeviceDialogOpen(false);
      setDeviceForm({ name: "", host: "", enabled: true });
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save device");
    }
  };

  if (loading || !snapshot || !qbForm || !webhookForm || !automationForm || !monitoringForm) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading Bitflow...</div>;
  }

  return (
    <main className="min-h-screen bg-grid-fade bg-grid-fade px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 rounded-3xl border bg-card/80 p-6 shadow-sm backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="default">Automation</Badge>
              <Badge variant={snapshot.state.qbittorrentMode === "throttled" ? "warning" : "success"}>
                qBittorrent {snapshot.state.qbittorrentMode}
              </Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Bitflow</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A self-hosted controller for qBittorrent throttling based on Jellyfin activity and network presence.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
              {theme === "dark" ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
              Theme
            </Button>
            <Button variant="secondary" onClick={() => void refresh()}>
              <RefreshCcw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatusCard title="Streaming" value={snapshot.derived.streamingActive ? "Active" : "Idle"} hint={`Last webhook: ${formatDateTime(snapshot.state.lastWebhookAt)}`} icon={PlayCircle} active={snapshot.derived.streamingActive} />
          <StatusCard title="Devices" value={snapshot.derived.devicesActive ? "Activity seen" : "Idle"} hint={`Last device activity: ${formatDateTime(snapshot.state.lastDeviceActivityAt)}`} icon={Router} active={snapshot.derived.devicesActive} />
          <StatusCard title="qBittorrent" value={snapshot.state.qbittorrentMode} hint={snapshot.state.lastThrottleAction ?? "No action applied yet"} icon={Wifi} active={snapshot.state.qbittorrentMode === "throttled"} />
          <StatusCard
            title="Controller"
            value={snapshot.derived.streamingActive || snapshot.derived.devicesActive ? "Active" : snapshot.derived.cooldownActive ? "Cooldown" : "Normal"}
            hint={snapshot.derived.cooldownActive ? `Unthrottle cooldown: ${formatDuration(liveCooldownRemainingSeconds)}` : `Last evaluation: ${formatDateTime(snapshot.state.lastEvaluatedAt)}`}
            icon={Activity}
            active={snapshot.derived.effectiveActive}
          />
        </div>

        <Tabs defaultValue="dashboard">
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="qbittorrent">qBittorrent</TabsTrigger>
            <TabsTrigger value="webhook">Webhook</TabsTrigger>
            <TabsTrigger value="devices">Devices</TabsTrigger>
            <TabsTrigger value="automation">Automation</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
              <Card>
                <CardHeader>
                  <CardTitle>Runtime controls</CardTitle>
                  <CardDescription>Manual actions and quick tests for each subsystem.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <ActionButton onClick={() => void runAction("/api/actions/force-throttle", "POST", undefined, "Throttle applied")}>Force throttle</ActionButton>
                  <ActionButton onClick={() => void runAction("/api/actions/force-unthrottle", "POST", undefined, "Normal limits restored")}>Force unthrottle</ActionButton>
                  <ActionButton onClick={() => void runAction("/api/settings/qbittorrent/test", "POST", undefined, "qBittorrent connection OK")}>Test qBittorrent</ActionButton>
                  <ActionButton onClick={() => void runAction("/api/settings/webhook/test", "POST", undefined, "Webhook test registered")}>Test webhook</ActionButton>
                  <ActionButton onClick={() => void runAction("/api/actions/test-pings", "POST", undefined, "Ping cycle complete")}>Test devices</ActionButton>
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>Current limits</CardTitle>
                  <CardDescription>Configured normal and throttled profiles.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <LimitRow label="Normal download" value={bytesPerSecondLabel(snapshot.qbittorrent.normalDownloadLimit)} />
                  <LimitRow label="Normal upload" value={bytesPerSecondLabel(snapshot.qbittorrent.normalUploadLimit)} />
                  <LimitRow label="Throttled download" value={bytesPerSecondLabel(snapshot.qbittorrent.throttledDownloadLimit)} />
                  <LimitRow label="Throttled upload" value={bytesPerSecondLabel(snapshot.qbittorrent.throttledUploadLimit)} />
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Recent activity</CardTitle>
                <CardDescription>Latest webhook, ping, and automation events.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {snapshot.recentLogs.slice(0, 8).map((log) => (
                  <div key={log.id} className="flex items-start justify-between gap-4 rounded-xl border bg-background/70 px-4 py-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={log.level === "error" ? "destructive" : log.level === "warn" ? "warning" : "secondary"}>{log.eventType}</Badge>
                        <span className="text-sm font-medium">{log.message}</span>
                      </div>
                      {log.metadata ? <p className="mt-1 text-xs text-muted-foreground">{log.metadata}</p> : null}
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="qbittorrent">
            <Card>
              <CardHeader>
                <CardTitle>qBittorrent settings</CardTitle>
                <CardDescription>Configure the Web API endpoint and bandwidth profiles.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <Field label="Host URL">
                  <Input value={qbForm.hostUrl} onChange={(event) => setQbForm((current) => current && ({ ...current, hostUrl: event.target.value }))} placeholder="http://qbittorrent:8080" />
                </Field>
                <Field label="API key">
                  <Input type="password" value={qbForm.apiKey} placeholder={snapshot.qbittorrent.apiKeyConfigured ? "Saved API key" : "qbt_..."} onChange={(event) => setQbForm((current) => current && ({ ...current, apiKey: event.target.value }))} />
                </Field>
                <div className="rounded-2xl border bg-muted/40 p-4 text-sm text-muted-foreground">
                  Connection status
                  <div className="mt-2 font-medium text-foreground">
                    {snapshot.state.lastQbittorrentError ? snapshot.state.lastQbittorrentError : `Last connected: ${formatDateTime(snapshot.state.lastQbittorrentConnectionAt)}`}
                  </div>
                </div>
                <Field label="Throttled download (B/s)">
                  <Input type="number" value={qbForm.throttledDownloadLimit} onChange={(event) => setQbForm((current) => current && ({ ...current, throttledDownloadLimit: Number(event.target.value) || 0 }))} />
                </Field>
                <Field label="Throttled upload (B/s)">
                  <Input type="number" value={qbForm.throttledUploadLimit} onChange={(event) => setQbForm((current) => current && ({ ...current, throttledUploadLimit: Number(event.target.value) || 0 }))} />
                </Field>
                <Field label="Normal download (B/s)">
                  <Input type="number" value={qbForm.normalDownloadLimit} onChange={(event) => setQbForm((current) => current && ({ ...current, normalDownloadLimit: Number(event.target.value) || 0 }))} />
                </Field>
                <Field label="Normal upload (B/s)">
                  <Input type="number" value={qbForm.normalUploadLimit} onChange={(event) => setQbForm((current) => current && ({ ...current, normalUploadLimit: Number(event.target.value) || 0 }))} />
                </Field>
              </CardContent>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => void saveSection("qbittorrent", "/api/settings/qbittorrent", qbForm)}
                    disabled={saving === "qbittorrent"}
                  >
                    <Save className="h-4 w-4" />
                    Save qBittorrent
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      void runAction(
                        "/api/settings/qbittorrent/test",
                        "POST",
                        {
                          hostUrl: qbForm.hostUrl,
                          apiKey: qbForm.apiKey,
                          throttledUploadLimit: qbForm.throttledUploadLimit,
                          throttledDownloadLimit: qbForm.throttledDownloadLimit,
                          normalUploadLimit: qbForm.normalUploadLimit,
                          normalDownloadLimit: qbForm.normalDownloadLimit
                        },
                        "qBittorrent connection OK"
                      )
                    }
                  >
                    <TestTube2 className="h-4 w-4" />
                    Test connection
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="webhook">
            <Card>
              <CardHeader>
                <CardTitle>Webhook settings</CardTitle>
                <CardDescription>Configure the Jellyfin callback endpoint and optional shared secret.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-2xl border bg-muted/40 p-4">
                  <div>
                    <p className="font-medium">Enable webhook handling</p>
                    <p className="text-sm text-muted-foreground">When disabled, Jellyfin activity is ignored.</p>
                  </div>
                  <Switch checked={webhookForm.enabled} onCheckedChange={(checked) => setWebhookForm((current) => current && ({ ...current, enabled: checked }))} />
                </div>
                <div className="rounded-2xl border bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">Last webhook</p>
                  <p className="mt-1 font-medium">{formatDateTime(snapshot.state.lastWebhookAt)}</p>
                </div>
                <Field label="Token / route segment">
                  <Input value={webhookForm.token} onChange={(event) => setWebhookForm((current) => current && ({ ...current, token: event.target.value }))} />
                </Field>
                <Field label="Shared secret">
                  <Input type="password" value={webhookForm.secret} placeholder={snapshot.webhook.secretConfigured ? "Saved secret" : ""} onChange={(event) => setWebhookForm((current) => current && ({ ...current, secret: event.target.value }))} />
                </Field>
                <Field label="Webhook active window (seconds)">
                  <Input type="number" value={webhookForm.activityWindowSeconds} onChange={(event) => setWebhookForm((current) => current && ({ ...current, activityWindowSeconds: Number(event.target.value) || 0 }))} />
                </Field>
                <Field label="Webhook URL">
                  <div className="flex gap-2">
                    <Input readOnly value={webhookUrl} />
                    <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(webhookUrl).then(() => toast.success("Webhook URL copied"))}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </Field>
              </CardContent>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-3">
                  <Button
                    onClick={() => void saveSection("webhook", "/api/settings/webhook", webhookForm)}
                    disabled={saving === "webhook"}
                  >
                    <Save className="h-4 w-4" />
                    Save webhook
                  </Button>
                  <Button variant="outline" onClick={() => void runAction("/api/settings/webhook/test", "POST", undefined, "Webhook test registered")}>
                    <TestTube2 className="h-4 w-4" />
                    Test reception
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="devices" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Device monitoring</CardTitle>
                <CardDescription>Ping selected devices and keep throttling active until the inactivity timeout expires.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Switch checked={monitoringForm.enabled} onCheckedChange={(checked) => setMonitoringForm({ enabled: checked })} />
                  <div>
                    <p className="font-medium">Enable device monitoring</p>
                    <p className="text-sm text-muted-foreground">If disabled, device reachability does not affect throttling.</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => void saveSection("monitoring", "/api/settings/monitoring", monitoringForm)}>
                    <Save className="h-4 w-4" />
                    Save toggle
                  </Button>
                  <Dialog open={deviceDialogOpen} onOpenChange={setDeviceDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => openDeviceDialog()}>Add device</Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{deviceForm.id ? "Edit device" : "Add device"}</DialogTitle>
                        <DialogDescription>Configure a host that should keep qBittorrent throttled while it is online.</DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <Field label="Name">
                          <Input value={deviceForm.name} onChange={(event) => setDeviceForm((current) => ({ ...current, name: event.target.value }))} />
                        </Field>
                        <Field label="IP address or hostname">
                          <Input value={deviceForm.host} onChange={(event) => setDeviceForm((current) => ({ ...current, host: event.target.value }))} />
                        </Field>
                        <div className="flex items-center justify-between rounded-xl border p-3">
                          <Label htmlFor="device-enabled">Enabled</Label>
                          <Switch id="device-enabled" checked={deviceForm.enabled} onCheckedChange={(checked) => setDeviceForm((current) => ({ ...current, enabled: checked }))} />
                        </div>
                        <Button className="w-full" onClick={() => void submitDevice()}>
                          Save device
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Configured devices</CardTitle>
                <CardDescription>Reachable devices extend the throttled state until the inactivity timeout elapses.</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Host</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Last online</TableHead>
                      <TableHead>Last ping</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {snapshot.devices.map((device) => (
                      <TableRow key={device.id}>
                        <TableCell>
                          <div className="font-medium">{device.name}</div>
                          <div className="text-xs text-muted-foreground">{device.enabled ? "Enabled" : "Disabled"}</div>
                        </TableCell>
                        <TableCell>{device.host}</TableCell>
                        <TableCell>
                          <Badge variant={device.lastReachable ? "success" : "secondary"}>{device.lastReachable ? "Online" : "Offline"}</Badge>
                        </TableCell>
                        <TableCell>{formatDateTime(device.lastSeenAt)}</TableCell>
                        <TableCell>{formatDateTime(device.lastPingAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openDeviceDialog(device)}>
                              Edit
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void runAction(`/api/devices/${device.id}/test`, "POST", undefined, "Ping test completed")}>
                              Ping
                            </Button>
                            <Button variant="destructive" size="sm" onClick={() => void runAction(`/api/devices/${device.id}`, "DELETE", undefined, "Device removed")}>
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automation">
            <Card>
              <CardHeader>
                <CardTitle>Automation settings</CardTitle>
                <CardDescription>Control how long Bitflow stays throttled after activity stops and how often background checks run.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-6 md:grid-cols-3">
                <Field label="Cooldown before unthrottle (minutes)">
                  <Input type="number" value={automationForm.inactivityTimeoutMinutes} onChange={(event) => setAutomationForm((current) => current && ({ ...current, inactivityTimeoutMinutes: Number(event.target.value) || 0 }))} />
                </Field>
                <Field label="Ping interval (seconds)">
                  <Input type="number" value={automationForm.pingIntervalSeconds} onChange={(event) => setAutomationForm((current) => current && ({ ...current, pingIntervalSeconds: Number(event.target.value) || 0 }))} />
                </Field>
                <Field label="Evaluation interval (seconds)">
                  <Input type="number" value={automationForm.evaluationIntervalSeconds} onChange={(event) => setAutomationForm((current) => current && ({ ...current, evaluationIntervalSeconds: Number(event.target.value) || 0 }))} />
                </Field>
              </CardContent>
              <CardContent className="pt-6">
                <Button onClick={() => void saveSection("automation", "/api/settings/automation", automationForm)} disabled={saving === "automation"}>
                  <Save className="h-4 w-4" />
                  Save automation
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>Logs and history</CardTitle>
                <CardDescription>Important events are persisted in SQLite and survive Docker restarts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {snapshot.recentLogs.map((log) => (
                  <div key={log.id} className="rounded-2xl border p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={log.level === "error" ? "destructive" : log.level === "warn" ? "warning" : "secondary"}>{log.level}</Badge>
                        <span className="font-medium">{log.eventType}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{formatDateTime(log.createdAt)}</span>
                    </div>
                    <p className="mt-2 text-sm">{log.message}</p>
                    {log.metadata ? <Textarea className="mt-3 font-mono text-xs" readOnly value={log.metadata} /> : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function StatusCard({
  title,
  value,
  hint,
  icon: Icon,
  active
}: {
  title: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
}) {
  return (
    <Card className={cn("overflow-hidden border-white/40", active && "ring-1 ring-primary/30")}>
      <CardContent className="flex items-start justify-between p-6">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-2 text-2xl font-semibold capitalize">{value}</p>
          <p className="mt-2 text-sm text-muted-foreground">{hint}</p>
        </div>
        <div className={cn("rounded-2xl p-3", active ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground")}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function ActionButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <Button variant="outline" className="h-auto justify-start rounded-2xl p-4 text-left" onClick={onClick}>
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-primary/10 p-2 text-primary">
          <TestTube2 className="h-4 w-4" />
        </div>
        <span>{children}</span>
      </div>
    </Button>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border px-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
