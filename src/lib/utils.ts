import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value?: string | null) {
  if (!value) {
    return "Never";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Invalid date";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

export function bytesPerSecondLabel(value: number) {
  if (value <= 1) {
    return `${value} B/s`;
  }

  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let current = value;
  let index = 0;
  while (current >= 1000 && index < units.length - 1) {
    current /= 1000;
    index += 1;
  }
  return `${current.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}
