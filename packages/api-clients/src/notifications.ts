import { BaseClient } from "./base.js";
import type {
  Notification,
  SendNotificationInput,
  HealthCheckResponse,
} from "./types.js";

export class NotificationsClient extends BaseClient {
  constructor(baseUrl = "http://localhost:3005") {
    super(baseUrl);
  }

  health(): Promise<HealthCheckResponse> {
    return this.get("/health");
  }

  send(input: SendNotificationInput): Promise<Notification> {
    return this.post("/notifications", input);
  }

  sendBulk(
    notifications: SendNotificationInput[],
  ): Promise<Notification[]> {
    return this.post("/notifications/bulk", { notifications });
  }

  getNotifications(citizenId: string): Promise<Notification[]> {
    return this.get(
      `/notifications?citizen_id=${encodeURIComponent(citizenId)}`,
    );
  }

  getNotification(id: string): Promise<Notification> {
    return this.get(`/notifications/${id}`);
  }
}
