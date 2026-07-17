import type {
  NotificationChannel,
  NotificationMessage,
  NotificationSendResult,
} from "@/lib/notifications/types";

export interface NotificationProvider {
  channel: NotificationChannel;
  name: string;
  isConfigured(): boolean;
  send(message: NotificationMessage): Promise<NotificationSendResult>;
}
