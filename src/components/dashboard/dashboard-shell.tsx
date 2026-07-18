"use client";

import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode
} from "react";
import {
  Activity,
  Cable,
  Check,
  ChevronRight,
  CirclePause,
  CirclePlay,
  Clock3,
  Copy,
  Gauge,
  History,
  LayoutDashboard,
  LoaderCircle,
  Moon,
  Network,
  Play,
  RefreshCcw,
  Router,
  Save,
  Settings2,
  SlidersHorizontal,
  Sun,
  TestTube2,
  Trash2,
  Webhook,
  Wifi
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import type {
  AutomationSettings,
  DashboardSnapshot,
  DeviceMonitoringSettings,
  DeviceRecord,
  LogRecord
} from "@/lib/types";
import { MASKED_SECRET_VALUE } from "@/lib/secret-placeholders";
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
type DashboardTab =
  | "overview"
  | "qbittorrent"
  | "webhook"
  | "devices"
  | "automation"
  | "activity";

const navigation: Array<{
  value: DashboardTab;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}> = [
  {
    value: "overview",
    label: "Overview",
    description: "Runtime health and controls",
    icon: LayoutDashboard
  },
  {
    value: "qbittorrent",
    label: "qBittorrent",
    description: "Connection and speed profiles",
    icon: Gauge
  },
  {
    value: "webhook",
    label: "Jellyfin webhook",
    description: "Playback activity trigger",
    icon: Webhook
  },
  {
    value: "devices",
    label: "Devices",
    description: "Network presence checks",
    icon: Router
  },
  {
    value: "automation",
    label: "Automation",
    description: "Intervals and cooldown",
    icon: SlidersHorizontal
  },
  {
    value: "activity",
    label: "Activity",
    description: "Persistent event history",
    icon: History
  }
];

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    }
  });

  const responseBody = await response.text();
  let payload: ApiEnvelope<T>;

  try {
    payload = JSON.parse(responseBody) as ApiEnvelope<T>;
  } catch {
    throw new Error(
      `Server returned an invalid response (${response.status} ${response.statusText})`
    );
  }

  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload.data;
}

export function DashboardShell() {
  const { resolvedTheme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [qbForm, setQbForm] = useState<QbForm | null>(null);
  const [webhookForm, setWebhookForm] = useState<WebhookForm | null>(null);
  const [automationForm, setAutomationForm] =
    useState<AutomationSettings | null>(null);
  const [monitoringForm, setMonitoringForm] =
    useState<DeviceMonitoringSettings | null>(null);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [deviceForm, setDeviceForm] = useState<DeviceFormState>({
    name: "",
    host: "",
    enabled: true
  });
  const [nowTick, setNowTick] = useState(() => Date.now());

  const refresh = async (showProgress = false) => {
    if (showProgress) {
      setRefreshing(true);
    }

    try {
      const data = await api<DashboardSnapshot>("/api/dashboard");
      setSnapshot(data);
      setQbForm(
        (current) =>
          current ?? {
            ...data.qbittorrent,
            apiKey: data.qbittorrent.apiKeyConfigured
              ? MASKED_SECRET_VALUE
              : ""
          }
      );
      setWebhookForm(
        (current) => current ?? { ...data.webhook, secret: "" }
      );
      setAutomationForm((current) => current ?? data.automation);
      setMonitoringForm((current) => current ?? data.monitoring);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to load dashboard"
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
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

    const lastActivityTimes = [
      snapshot.state.lastWebhookAt,
      snapshot.state.lastDeviceActivityAt,
      snapshot.state.lastManualThrottleAt
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => new Date(value).getTime())
      .filter((value) => !Number.isNaN(value));

    const latestActivityAt =
      lastActivityTimes.length > 0 ? Math.max(...lastActivityTimes) : null;

    if (!latestActivityAt) {
      return snapshot.derived.cooldownRemainingSeconds;
    }

    const remaining =
      snapshot.automation.inactivityTimeoutMinutes * 60 -
      Math.floor((nowTick - latestActivityAt) / 1000);

    return Math.max(0, remaining);
  }, [nowTick, snapshot]);

  const saveSection = async (key: string, url: string, body: unknown) => {
    setSaving(key);

    try {
      await api(url, {
        method: "PUT",
        body: JSON.stringify(body)
      });

      if (key === "qbittorrent") {
        setQbForm((current) =>
          current
            ? {
                ...current,
                apiKey: current.apiKey ? MASKED_SECRET_VALUE : ""
              }
            : current
        );
      }

      toast.success("Settings saved");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const runAction = async (
    url: string,
    method: "POST" | "DELETE" = "POST",
    body?: unknown,
    message?: string
  ) => {
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
        ? {
            id: device.id,
            name: device.name,
            host: device.host,
            enabled: device.enabled
          }
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
      toast.error(
        error instanceof Error ? error.message : "Failed to save device"
      );
    }
  };

  const copyWebhookUrl = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      toast.success("Webhook URL copied");
    } catch {
      toast.error("Could not copy the webhook URL");
    }
  };

  if (
    loading ||
    !snapshot ||
    !qbForm ||
    !webhookForm ||
    !automationForm ||
    !monitoringForm
  ) {
    return <DashboardSkeleton />;
  }

  const activeNavigation =
    navigation.find((item) => item.value === activeTab) ?? navigation[0];
  const controllerState = snapshot.state.automationPaused
    ? "Paused"
    : snapshot.derived.streamingActive || snapshot.derived.devicesActive
      ? "Active"
      : snapshot.derived.cooldownActive
        ? "Cooldown"
        : "Normal";

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as DashboardTab)}
      className="min-h-screen bg-background lg:flex"
    >
      <aside className="hidden w-64 shrink-0 border-r bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-16 items-center gap-3 px-5">
          <BrandMark />
          <div>
            <p className="text-sm font-semibold leading-none">Bitflow</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Bandwidth controller
            </p>
          </div>
        </div>
        <Separator />
        <div className="px-3 py-5">
          <p className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Workspace
          </p>
          <DashboardNavigation orientation="vertical" />
        </div>
        <div className="mt-auto p-3">
          <Card className="shadow-none">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Automation
                </span>
                <StatusDot
                  active={!snapshot.state.automationPaused}
                  paused={snapshot.state.automationPaused}
                />
              </div>
              <p className="mt-2 text-sm font-medium">
                {snapshot.state.automationPaused
                  ? "Emergency pause"
                  : "Monitoring active"}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {snapshot.state.automationPaused
                  ? "Normal bandwidth limits are restored."
                  : "Jellyfin and device signals are being evaluated."}
              </p>
            </CardContent>
          </Card>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="lg:hidden">
                <BrandMark />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-sm font-semibold">
                  {activeNavigation.label}
                </h1>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">
                  {activeNavigation.description}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="icon"
              aria-label="Refresh dashboard"
              onClick={() => void refresh(true)}
              disabled={refreshing}
            >
              <RefreshCcw
                className={cn("h-4 w-4", refreshing && "animate-spin")}
              />
            </Button>
            <Button
              variant="outline"
              size="icon"
              aria-label="Toggle color theme"
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
            >
              {resolvedTheme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
            </Button>
            <Button
              variant={
                snapshot.state.automationPaused ? "default" : "destructive"
              }
              onClick={() =>
                void runAction(
                  "/api/settings/automation",
                  snapshot.state.automationPaused ? "DELETE" : "POST",
                  undefined,
                  snapshot.state.automationPaused
                    ? "Automation resumed"
                    : "Emergency pause enabled; normal limits restored"
                )
              }
            >
              {snapshot.state.automationPaused ? (
                <CirclePlay className="h-4 w-4" />
              ) : (
                <CirclePause className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">
                {snapshot.state.automationPaused
                  ? "Resume automation"
                  : "Emergency pause"}
              </span>
              <span className="sm:hidden">
                {snapshot.state.automationPaused ? "Resume" : "Pause"}
              </span>
            </Button>
          </div>
        </header>

        <div className="border-b bg-background px-4 py-2 lg:hidden">
          <DashboardNavigation orientation="horizontal" />
        </div>

        <main className="mx-auto w-full max-w-[1440px] p-4 sm:p-5 lg:p-6">
          {snapshot.state.automationPaused ? (
            <Card className="mb-6 border-destructive/40 bg-destructive/5 shadow-none">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-md bg-destructive/10 p-2 text-destructive">
                    <CirclePause className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      Automation is paused
                    </p>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      Normal qBittorrent limits are restored and activity
                      signals will not trigger throttling.
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() =>
                    void runAction(
                      "/api/settings/automation",
                      "DELETE",
                      undefined,
                      "Automation resumed"
                    )
                  }
                >
                  <CirclePlay className="h-4 w-4" />
                  Resume
                </Button>
              </CardContent>
            </Card>
          ) : null}

          <TabsContent value="overview" className="mt-0 space-y-6">
            <PageIntro
              eyebrow="Control center"
              title="Bandwidth at a glance"
              description="See what is influencing qBittorrent and take direct control when you need it."
            >
              <Badge
                variant={
                  snapshot.state.qbittorrentMode === "throttled"
                    ? "warning"
                    : snapshot.state.qbittorrentMode === "normal"
                      ? "success"
                      : "secondary"
                }
                className="h-6"
              >
                <StatusDot
                  active={snapshot.state.qbittorrentMode === "normal"}
                  warning={snapshot.state.qbittorrentMode === "throttled"}
                />
                qBittorrent {snapshot.state.qbittorrentMode}
              </Badge>
            </PageIntro>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatusCard
                title="Streaming"
                value={snapshot.derived.streamingActive ? "Active" : "Idle"}
                hint={`Last webhook ${formatDateTime(snapshot.state.lastWebhookAt)}`}
                icon={Play}
                active={snapshot.derived.streamingActive}
              />
              <StatusCard
                title="Network devices"
                value={
                  snapshot.derived.devicesActive ? "Activity seen" : "Idle"
                }
                hint={`Last activity ${formatDateTime(snapshot.state.lastDeviceActivityAt)}`}
                icon={Network}
                active={snapshot.derived.devicesActive}
              />
              <StatusCard
                title="qBittorrent"
                value={snapshot.state.qbittorrentMode}
                hint={
                  snapshot.state.lastThrottleAction ??
                  "No bandwidth action applied yet"
                }
                icon={Wifi}
                active={snapshot.state.qbittorrentMode === "throttled"}
                warning={snapshot.state.qbittorrentMode === "throttled"}
              />
              <StatusCard
                title="Controller"
                value={controllerState}
                hint={
                  snapshot.state.automationPaused
                    ? "Throttling disabled until resumed"
                    : snapshot.derived.cooldownActive
                      ? `Cooldown ${formatDuration(liveCooldownRemainingSeconds)} remaining`
                      : `Evaluated ${formatDateTime(snapshot.state.lastEvaluatedAt)}`
                }
                icon={Activity}
                active={snapshot.derived.effectiveActive}
                warning={snapshot.derived.cooldownActive}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
              <Card>
                <CardHeader>
                  <CardTitle>Runtime controls</CardTitle>
                  <CardDescription>
                    Manual actions apply immediately to the running controller.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <ActionButton
                    icon={Gauge}
                    label="Force throttle"
                    description="Apply the throttled speed profile"
                    disabled={snapshot.state.automationPaused}
                    onClick={() =>
                      void runAction(
                        "/api/actions/force-throttle",
                        "POST",
                        undefined,
                        "Throttle applied"
                      )
                    }
                  />
                  <ActionButton
                    icon={Wifi}
                    label="Restore normal limits"
                    description="Apply the normal speed profile"
                    onClick={() =>
                      void runAction(
                        "/api/actions/force-unthrottle",
                        "POST",
                        undefined,
                        "Normal limits restored"
                      )
                    }
                  />
                  <ActionButton
                    icon={Cable}
                    label="Test qBittorrent"
                    description="Check API connectivity"
                    onClick={() =>
                      void runAction(
                        "/api/settings/qbittorrent/test",
                        "POST",
                        undefined,
                        "qBittorrent connection OK"
                      )
                    }
                  />
                  <ActionButton
                    icon={TestTube2}
                    label="Run device checks"
                    description="Start a network ping cycle"
                    onClick={() =>
                      void runAction(
                        "/api/actions/test-pings",
                        "POST",
                        undefined,
                        "Ping cycle complete"
                      )
                    }
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Bandwidth profiles</CardTitle>
                  <CardDescription>
                    Current values configured in qBittorrent.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                  <LimitRow
                    label="Normal download"
                    value={bytesPerSecondLabel(
                      snapshot.qbittorrent.normalDownloadLimit
                    )}
                  />
                  <LimitRow
                    label="Normal upload"
                    value={bytesPerSecondLabel(
                      snapshot.qbittorrent.normalUploadLimit
                    )}
                  />
                  <Separator className="my-2" />
                  <LimitRow
                    label="Throttled download"
                    value={bytesPerSecondLabel(
                      snapshot.qbittorrent.throttledDownloadLimit
                    )}
                  />
                  <LimitRow
                    label="Throttled upload"
                    value={bytesPerSecondLabel(
                      snapshot.qbittorrent.throttledUploadLimit
                    )}
                  />
                </CardContent>
                <CardFooter>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => setActiveTab("qbittorrent")}
                  >
                    Edit profiles
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            </div>

            <ActivityCard
              logs={snapshot.recentLogs.slice(0, 6)}
              onViewAll={() => setActiveTab("activity")}
            />
          </TabsContent>

          <TabsContent value="qbittorrent" className="mt-0 space-y-6">
            <PageIntro
              eyebrow="Integration"
              title="qBittorrent"
              description="Connect Bitflow to the Web API and define the normal and throttled bandwidth profiles."
            >
              <Button
                variant="outline"
                onClick={() =>
                  void runAction(
                    "/api/settings/qbittorrent/test",
                    "POST",
                    {
                      hostUrl: qbForm.hostUrl,
                      urlBase: qbForm.urlBase,
                      apiKey: qbForm.apiKey,
                      throttledUploadLimit:
                        qbForm.throttledUploadLimit,
                      throttledDownloadLimit:
                        qbForm.throttledDownloadLimit,
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
            </PageIntro>

            <div className="grid gap-6 xl:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Web API connection</CardTitle>
                  <CardDescription>
                    Use the direct qBittorrent endpoint or a compatible proxy.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <Field label="Host URL" htmlFor="qb-host">
                    <Input
                      id="qb-host"
                      value={qbForm.hostUrl}
                      onChange={(event) =>
                        setQbForm(
                          (current) =>
                            current && {
                              ...current,
                              hostUrl: event.target.value
                            }
                        )
                      }
                      placeholder="http://qbittorrent:8080"
                    />
                  </Field>
                  <Field
                    label="URL base"
                    htmlFor="qb-url-base"
                    hint="Optional path prefix used by a reverse proxy."
                  >
                    <Input
                      id="qb-url-base"
                      value={qbForm.urlBase}
                      onChange={(event) =>
                        setQbForm(
                          (current) =>
                            current && {
                              ...current,
                              urlBase: event.target.value
                            }
                        )
                      }
                      placeholder="/proxy/abc123"
                    />
                  </Field>
                  <Field label="API key" htmlFor="qb-api-key">
                    <Input
                      id="qb-api-key"
                      type="password"
                      value={qbForm.apiKey}
                      placeholder={
                        snapshot.qbittorrent.apiKeyConfigured
                          ? "Saved API key"
                          : "Optional"
                      }
                      onChange={(event) =>
                        setQbForm(
                          (current) =>
                            current && {
                              ...current,
                              apiKey: event.target.value
                            }
                        )
                      }
                    />
                  </Field>
                  <div className="rounded-lg border bg-muted/40 p-4">
                    <div className="flex items-center gap-2">
                      <StatusDot
                        active={!snapshot.state.lastQbittorrentError}
                        paused={Boolean(
                          snapshot.state.lastQbittorrentError
                        )}
                      />
                      <p className="text-sm font-medium">
                        Connection status
                      </p>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {snapshot.state.lastQbittorrentError
                        ? snapshot.state.lastQbittorrentError
                        : `Last connected ${formatDateTime(snapshot.state.lastQbittorrentConnectionAt)}`}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Bandwidth profiles</CardTitle>
                  <CardDescription>
                    qBittorrent expects limits in bytes per second. Use 0 for
                    unlimited.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ProfileFields
                    title="Throttled"
                    description="Applied while playback or device activity is detected."
                  >
                    <Field label="Download (B/s)" htmlFor="qb-throttle-down">
                      <Input
                        id="qb-throttle-down"
                        type="number"
                        min={0}
                        value={qbForm.throttledDownloadLimit}
                        onChange={(event) =>
                          setQbForm(
                            (current) =>
                              current && {
                                ...current,
                                throttledDownloadLimit:
                                  Number(event.target.value) || 0
                              }
                          )
                        }
                      />
                    </Field>
                    <Field label="Upload (B/s)" htmlFor="qb-throttle-up">
                      <Input
                        id="qb-throttle-up"
                        type="number"
                        min={0}
                        value={qbForm.throttledUploadLimit}
                        onChange={(event) =>
                          setQbForm(
                            (current) =>
                              current && {
                                ...current,
                                throttledUploadLimit:
                                  Number(event.target.value) || 0
                              }
                          )
                        }
                      />
                    </Field>
                  </ProfileFields>
                  <Separator />
                  <ProfileFields
                    title="Normal"
                    description="Restored after activity and the cooldown have ended."
                  >
                    <Field label="Download (B/s)" htmlFor="qb-normal-down">
                      <Input
                        id="qb-normal-down"
                        type="number"
                        min={0}
                        value={qbForm.normalDownloadLimit}
                        onChange={(event) =>
                          setQbForm(
                            (current) =>
                              current && {
                                ...current,
                                normalDownloadLimit:
                                  Number(event.target.value) || 0
                              }
                          )
                        }
                      />
                    </Field>
                    <Field label="Upload (B/s)" htmlFor="qb-normal-up">
                      <Input
                        id="qb-normal-up"
                        type="number"
                        min={0}
                        value={qbForm.normalUploadLimit}
                        onChange={(event) =>
                          setQbForm(
                            (current) =>
                              current && {
                                ...current,
                                normalUploadLimit:
                                  Number(event.target.value) || 0
                              }
                          )
                        }
                      />
                    </Field>
                  </ProfileFields>
                </CardContent>
              </Card>
            </div>

            <SaveBar
              label="Save qBittorrent settings"
              saving={saving === "qbittorrent"}
              onSave={() =>
                void saveSection(
                  "qbittorrent",
                  "/api/settings/qbittorrent",
                  qbForm
                )
              }
            />
          </TabsContent>

          <TabsContent value="webhook" className="mt-0 space-y-6">
            <PageIntro
              eyebrow="Integration"
              title="Jellyfin webhook"
              description="Receive playback events from Jellyfin and keep the throttled profile active during streaming."
            >
              <Button
                variant="outline"
                onClick={() =>
                  void runAction(
                    "/api/settings/webhook/test",
                    "POST",
                    undefined,
                    "Webhook test registered"
                  )
                }
              >
                <TestTube2 className="h-4 w-4" />
                Test reception
              </Button>
            </PageIntro>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <Card>
                <CardHeader>
                  <CardTitle>Endpoint configuration</CardTitle>
                  <CardDescription>
                    Add the generated URL to the Jellyfin webhook plugin.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <SettingToggle
                    id="webhook-enabled"
                    label="Enable webhook handling"
                    description="When disabled, incoming Jellyfin activity is ignored."
                    checked={webhookForm.enabled}
                    onCheckedChange={(checked) =>
                      setWebhookForm(
                        (current) =>
                          current && { ...current, enabled: checked }
                      )
                    }
                  />
                  <Field label="Webhook URL" htmlFor="webhook-url">
                    <div className="flex gap-2">
                      <Input id="webhook-url" readOnly value={webhookUrl} />
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Copy webhook URL"
                        onClick={() => void copyWebhookUrl()}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </Field>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      label="Token / route segment"
                      htmlFor="webhook-token"
                    >
                      <Input
                        id="webhook-token"
                        value={webhookForm.token}
                        onChange={(event) =>
                          setWebhookForm(
                            (current) =>
                              current && {
                                ...current,
                                token: event.target.value
                              }
                          )
                        }
                      />
                    </Field>
                    <Field
                      label="Shared secret"
                      htmlFor="webhook-secret"
                      hint="Optional request authentication."
                    >
                      <Input
                        id="webhook-secret"
                        type="password"
                        value={webhookForm.secret}
                        placeholder={
                          snapshot.webhook.secretConfigured
                            ? "Saved secret"
                            : "Optional"
                        }
                        onChange={(event) =>
                          setWebhookForm(
                            (current) =>
                              current && {
                                ...current,
                                secret: event.target.value
                              }
                          )
                        }
                      />
                    </Field>
                  </div>
                  <Field
                    label="Activity window (seconds)"
                    htmlFor="webhook-window"
                    hint="How long a playback event is considered active."
                  >
                    <Input
                      id="webhook-window"
                      type="number"
                      min={1}
                      value={webhookForm.activityWindowSeconds}
                      onChange={(event) =>
                        setWebhookForm(
                          (current) =>
                            current && {
                              ...current,
                              activityWindowSeconds:
                                Number(event.target.value) || 0
                            }
                        )
                      }
                    />
                  </Field>
                </CardContent>
              </Card>

              <Card className="h-fit">
                <CardHeader>
                  <CardTitle>Webhook health</CardTitle>
                  <CardDescription>
                    Latest activity received by Bitflow.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Status</span>
                    <Badge
                      variant={webhookForm.enabled ? "success" : "secondary"}
                    >
                      {webhookForm.enabled ? "Listening" : "Disabled"}
                    </Badge>
                  </div>
                  <Separator />
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Last webhook
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {formatDateTime(snapshot.state.lastWebhookAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Playback signal
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {snapshot.derived.streamingActive ? "Active" : "Idle"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <SaveBar
              label="Save webhook settings"
              saving={saving === "webhook"}
              onSave={() =>
                void saveSection(
                  "webhook",
                  "/api/settings/webhook",
                  webhookForm
                )
              }
            />
          </TabsContent>

          <TabsContent value="devices" className="mt-0 space-y-6">
            <PageIntro
              eyebrow="Presence"
              title="Network devices"
              description="Reachable devices can keep qBittorrent throttled until the configured inactivity timeout expires."
            >
              <Dialog
                open={deviceDialogOpen}
                onOpenChange={setDeviceDialogOpen}
              >
                <DialogTrigger asChild>
                  <Button onClick={() => openDeviceDialog()}>
                    <Router className="h-4 w-4" />
                    Add device
                  </Button>
                </DialogTrigger>
                <DeviceDialog
                  deviceForm={deviceForm}
                  setDeviceForm={setDeviceForm}
                  onSubmit={() => void submitDevice()}
                />
              </Dialog>
            </PageIntro>

            <Card>
              <CardContent className="p-4 sm:p-5">
                <SettingToggle
                  id="monitoring-enabled"
                  label="Enable device monitoring"
                  description="Run periodic ping checks and include reachable devices in automation decisions."
                  checked={monitoringForm.enabled}
                  onCheckedChange={(checked) =>
                    setMonitoringForm({ enabled: checked })
                  }
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={saving === "monitoring"}
                      onClick={() =>
                        void saveSection(
                          "monitoring",
                          "/api/settings/monitoring",
                          monitoringForm
                        )
                      }
                    >
                      {saving === "monitoring" ? (
                        <LoaderCircle className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      Save
                    </Button>
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Configured devices</CardTitle>
                <CardDescription>
                  {snapshot.devices.length}{" "}
                  {snapshot.devices.length === 1 ? "device" : "devices"}{" "}
                  registered.
                </CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {snapshot.devices.length === 0 ? (
                  <EmptyState
                    icon={Router}
                    title="No devices configured"
                    description="Add a host to start using network presence as an automation signal."
                    action={
                      <Button size="sm" onClick={() => openDeviceDialog()}>
                        Add your first device
                      </Button>
                    }
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Device</TableHead>
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
                            <div className="text-xs text-muted-foreground">
                              {device.enabled ? "Enabled" : "Disabled"}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {device.host}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                device.lastReachable
                                  ? "success"
                                  : "secondary"
                              }
                            >
                              <StatusDot active={device.lastReachable} />
                              {device.lastReachable ? "Online" : "Offline"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {formatDateTime(device.lastSeenAt)}
                          </TableCell>
                          <TableCell>
                            {formatDateTime(device.lastPingAt)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openDeviceDialog(device)}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  void runAction(
                                    `/api/devices/${device.id}/test`,
                                    "POST",
                                    undefined,
                                    "Ping test completed"
                                  )
                                }
                              >
                                Ping
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`Delete ${device.name}`}
                                onClick={() =>
                                  void runAction(
                                    `/api/devices/${device.id}`,
                                    "DELETE",
                                    undefined,
                                    "Device removed"
                                  )
                                }
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="automation" className="mt-0 space-y-6">
            <PageIntro
              eyebrow="Controller"
              title="Automation timing"
              description="Tune how often Bitflow checks its inputs and how long throttling remains active after activity stops."
            />

            <div className="grid gap-6 lg:grid-cols-3">
              <TimingCard
                icon={Clock3}
                title="Inactivity timeout"
                description="Cooldown before normal bandwidth is restored."
                suffix="minutes"
              >
                <Input
                  id="automation-timeout"
                  type="number"
                  min={0}
                  value={automationForm.inactivityTimeoutMinutes}
                  onChange={(event) =>
                    setAutomationForm(
                      (current) =>
                        current && {
                          ...current,
                          inactivityTimeoutMinutes:
                            Number(event.target.value) || 0
                        }
                    )
                  }
                />
              </TimingCard>
              <TimingCard
                icon={Router}
                title="Ping interval"
                description="Frequency of device presence checks."
                suffix="seconds"
              >
                <Input
                  id="automation-ping"
                  type="number"
                  min={1}
                  value={automationForm.pingIntervalSeconds}
                  onChange={(event) =>
                    setAutomationForm(
                      (current) =>
                        current && {
                          ...current,
                          pingIntervalSeconds:
                            Number(event.target.value) || 0
                        }
                    )
                  }
                />
              </TimingCard>
              <TimingCard
                icon={Settings2}
                title="Evaluation interval"
                description="Frequency of controller state evaluation."
                suffix="seconds"
              >
                <Input
                  id="automation-evaluation"
                  type="number"
                  min={1}
                  value={automationForm.evaluationIntervalSeconds}
                  onChange={(event) =>
                    setAutomationForm(
                      (current) =>
                        current && {
                          ...current,
                          evaluationIntervalSeconds:
                            Number(event.target.value) || 0
                        }
                    )
                  }
                />
              </TimingCard>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>How the controller decides</CardTitle>
                <CardDescription>
                  A compact view of the automation path described in the
                  project overview.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center">
                <FlowStep
                  number="1"
                  title="Observe"
                  description="Jellyfin events and optional device pings"
                />
                <ChevronRight className="hidden h-4 w-4 text-muted-foreground md:block" />
                <FlowStep
                  number="2"
                  title="Throttle"
                  description="Apply the reduced bandwidth profile"
                />
                <ChevronRight className="hidden h-4 w-4 text-muted-foreground md:block" />
                <FlowStep
                  number="3"
                  title="Restore"
                  description="Wait for cooldown, then apply normal limits"
                />
              </CardContent>
            </Card>

            <SaveBar
              label="Save automation settings"
              saving={saving === "automation"}
              onSave={() =>
                void saveSection(
                  "automation",
                  "/api/settings/automation",
                  automationForm
                )
              }
            />
          </TabsContent>

          <TabsContent value="activity" className="mt-0 space-y-6">
            <PageIntro
              eyebrow="History"
              title="Activity log"
              description="Webhook, device, and automation events persisted in SQLite across restarts."
            >
              <Button
                variant="outline"
                onClick={() => void refresh(true)}
                disabled={refreshing}
              >
                <RefreshCcw
                  className={cn("h-4 w-4", refreshing && "animate-spin")}
                />
                Refresh
              </Button>
            </PageIntro>

            <Card>
              <CardContent className="p-0">
                {snapshot.recentLogs.length === 0 ? (
                  <EmptyState
                    icon={History}
                    title="No activity yet"
                    description="Controller events will appear here as Bitflow starts working."
                  />
                ) : (
                  <div className="divide-y">
                    {snapshot.recentLogs.map((log) => (
                      <LogItem key={log.id} log={log} expanded />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </main>
      </div>
    </Tabs>
  );
}

function DashboardNavigation({
  orientation
}: {
  orientation: "vertical" | "horizontal";
}) {
  if (orientation === "horizontal") {
    return (
      <TabsList className="h-auto w-full justify-start gap-1 overflow-x-auto bg-transparent p-0">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <TabsTrigger
              key={item.value}
              value={item.value}
              className="h-9 flex-none px-3 text-muted-foreground data-[state=active]:text-foreground"
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </TabsTrigger>
          );
        })}
      </TabsList>
    );
  }

  return (
    <TabsList className="h-auto w-full flex-col items-stretch gap-1 bg-transparent p-0">
      {navigation.map((item) => {
        const Icon = item.icon;
        return (
          <TabsTrigger
            key={item.value}
            value={item.value}
            className="h-auto w-full flex-none justify-start gap-3 border-0 px-3 py-2.5 text-muted-foreground shadow-none data-[state=active]:bg-muted data-[state=active]:text-foreground data-[state=active]:shadow-none"
          >
            <Icon className="h-4 w-4" />
            <span className="text-left">
              <span className="block text-sm">{item.label}</span>
            </span>
          </TabsTrigger>
        );
      })}
    </TabsList>
  );
}

function BrandMark() {
  return (
    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-foreground text-background">
      <Activity className="h-5 w-5" />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="hidden w-64 border-r bg-background p-5 lg:block">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9" />
          <div className="space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-2.5 w-28" />
          </div>
        </div>
        <div className="mt-10 space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      </aside>
      <div className="flex-1">
        <div className="h-16 border-b bg-background" />
        <main className="mx-auto max-w-[1440px] space-y-5 p-4 sm:p-5 lg:p-6">
          <div className="space-y-3">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-72 max-w-full" />
            <Skeleton className="h-4 w-[480px] max-w-full" />
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-36 w-full" />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Skeleton className="h-80 w-full" />
            <Skeleton className="h-80 w-full" />
          </div>
        </main>
      </div>
    </div>
  );
}

function PageIntro({
  eyebrow,
  title,
  description,
  children
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-medium text-muted-foreground">
          {eyebrow}
        </p>
        <h2 className="mt-1.5 text-xl font-semibold tracking-tight sm:text-2xl">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
      {children ? (
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      ) : null}
    </div>
  );
}

function StatusCard({
  title,
  value,
  hint,
  icon: Icon,
  active,
  warning = false
}: {
  title: string;
  value: string;
  hint: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  warning?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div
            className={cn(
              "rounded-md bg-muted p-2 text-muted-foreground",
              active && "bg-muted text-foreground",
              warning && "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="mt-3 text-xl font-semibold capitalize tracking-tight">
          {value}
        </p>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {hint}
        </p>
      </CardContent>
    </Card>
  );
}

function ActionButton({
  icon: Icon,
  label,
  description,
  onClick,
  disabled = false
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <Button
      variant="outline"
      className="h-auto justify-start whitespace-normal p-4 text-left"
      onClick={onClick}
      disabled={disabled}
    >
      <div className="rounded-md bg-muted p-2 text-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
          {description}
        </span>
      </span>
    </Button>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>
        <Label htmlFor={htmlFor}>{label}</Label>
        {hint ? (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md px-2 py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ActivityCard({
  logs,
  onViewAll
}: {
  logs: LogRecord[];
  onViewAll: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle>Recent activity</CardTitle>
          <CardDescription className="mt-1.5">
            Latest webhook, ping, and automation events.
          </CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={onViewAll}>
          View all
          <ChevronRight className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <EmptyState
            icon={History}
            title="No activity yet"
            description="Controller events will appear here."
          />
        ) : (
          <div className="divide-y">
            {logs.map((log) => (
              <LogItem key={log.id} log={log} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LogItem({
  log,
  expanded = false
}: {
  log: LogRecord;
  expanded?: boolean;
}) {
  return (
    <div className={cn("py-4 first:pt-0 last:pb-0", expanded && "px-5 first:pt-4 last:pb-4")}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div
            className={cn(
              "mt-0.5 rounded-full bg-muted p-1.5 text-muted-foreground",
              log.level === "error" &&
                "bg-destructive/10 text-destructive",
              log.level === "warn" &&
                "bg-amber-500/10 text-amber-600 dark:text-amber-400"
            )}
          >
            {log.level === "error" ? (
              <CirclePause className="h-3.5 w-3.5" />
            ) : (
              <Activity className="h-3.5 w-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium">{log.message}</p>
              <Badge
                variant={
                  log.level === "error"
                    ? "destructive"
                    : log.level === "warn"
                      ? "warning"
                      : "secondary"
                }
              >
                {log.eventType}
              </Badge>
            </div>
            {expanded && log.metadata ? (
              <pre className="mt-3 max-w-full overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                {log.metadata}
              </pre>
            ) : null}
          </div>
        </div>
        <span className="shrink-0 pl-9 text-xs text-muted-foreground sm:pl-0">
          {formatDateTime(log.createdAt)}
        </span>
      </div>
    </div>
  );
}

function ProfileFields({
  title,
  description,
  children
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-4">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </div>
  );
}

function SettingToggle({
  id,
  label,
  description,
  checked,
  onCheckedChange,
  action
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
      <div className="min-w-0 flex-1">
        <Label htmlFor={id}>{label}</Label>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function DeviceDialog({
  deviceForm,
  setDeviceForm,
  onSubmit
}: {
  deviceForm: DeviceFormState;
  setDeviceForm: (
    value:
      | DeviceFormState
      | ((current: DeviceFormState) => DeviceFormState)
  ) => void;
  onSubmit: () => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>
          {deviceForm.id ? "Edit device" : "Add device"}
        </DialogTitle>
        <DialogDescription>
          Configure a host that should keep qBittorrent throttled while it is
          reachable.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-4">
        <Field label="Name" htmlFor="device-name">
          <Input
            id="device-name"
            value={deviceForm.name}
            onChange={(event) =>
              setDeviceForm((current) => ({
                ...current,
                name: event.target.value
              }))
            }
            placeholder="Living room TV"
          />
        </Field>
        <Field label="IP address or hostname" htmlFor="device-host">
          <Input
            id="device-host"
            value={deviceForm.host}
            onChange={(event) =>
              setDeviceForm((current) => ({
                ...current,
                host: event.target.value
              }))
            }
            placeholder="192.168.1.42"
          />
        </Field>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <Label htmlFor="device-enabled">Enable monitoring</Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Include this host in ping cycles.
            </p>
          </div>
          <Switch
            id="device-enabled"
            checked={deviceForm.enabled}
            onCheckedChange={(checked) =>
              setDeviceForm((current) => ({ ...current, enabled: checked }))
            }
          />
        </div>
        <Button
          className="w-full"
          onClick={onSubmit}
          disabled={!deviceForm.name.trim() || !deviceForm.host.trim()}
        >
          <Check className="h-4 w-4" />
          Save device
        </Button>
      </div>
    </DialogContent>
  );
}

function TimingCard({
  icon: Icon,
  title,
  description,
  suffix,
  children
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  suffix: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-3 w-fit rounded-md bg-muted p-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="relative">
          {children}
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function FlowStep({
  number,
  title,
  description
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4">
      <Badge variant="outline" className="h-6 w-6 rounded-full p-0">
        {number}
      </Badge>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function SaveBar({
  label,
  saving,
  onSave
}: {
  label: string;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <div className="sticky bottom-4 z-20 flex justify-end rounded-lg border bg-background/95 p-2.5 shadow-sm backdrop-blur">
      <Button onClick={onSave} disabled={saving}>
        {saving ? (
          <LoaderCircle className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {saving ? "Saving…" : label}
      </Button>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
      <div className="rounded-full bg-muted p-3 text-muted-foreground">
        <Icon className="h-5 w-5" />
      </div>
      <p className="mt-4 text-sm font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

function StatusDot({
  active = false,
  paused = false,
  warning = false
}: {
  active?: boolean;
  paused?: boolean;
  warning?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full bg-muted-foreground/40",
        active && "bg-emerald-500",
        paused && "bg-destructive",
        warning && "bg-amber-500"
      )}
    />
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
