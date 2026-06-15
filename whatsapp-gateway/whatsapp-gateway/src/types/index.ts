export type SessionStatus =
  | "connecting"
  | "qr_ready"
  | "connected"
  | "disconnected"
  | "error";

export interface SessionInfo {
  tenantId: string;
  status: SessionStatus;
  qrCode: string | null;       // base64 da imagem do QR
  qrString: string | null;     // string raw do QR (para exibir no frontend)
  phoneNumber: string | null;
  connectedAt: Date | null;
  lastSeen: Date | null;
}

export interface SendTextPayload {
  tenantId: string;
  to: string;           // número no formato 5511999998888
  message: string;
}

export interface SendMediaPayload {
  tenantId: string;
  to: string;
  mediaUrl: string;
  caption?: string;
  mediaType: "image" | "video" | "document" | "audio";
  fileName?: string;
}

export interface IncomingMessage {
  tenantId: string;
  from: string;
  fromName: string | null;
  profilePicUrl?: string | null;
  body: string;
  messageId: string;
  timestamp: number;
  type: "text" | "image" | "video" | "audio" | "document" | "sticker" | "other";
  mediaUrl?: string;
  isGroup: boolean;
  groupId?: string;
  groupName?: string;
}

export interface WebhookPayload {
  event: "message.received" | "session.connected" | "session.disconnected" | "session.qr";
  tenantId: string;
  timestamp: number;
  data: IncomingMessage | SessionInfo | { qrCode: string; qrString: string };
}
