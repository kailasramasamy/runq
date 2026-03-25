export interface SendWhatsAppParams {
  to: string;
  templateName: string;
  templateParams: Record<string, string>;
  mediaUrl?: string;
}

export interface SendSmsParams {
  to: string;
  message: string;
}

export interface MessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface MessageProvider {
  sendWhatsApp(params: SendWhatsAppParams): Promise<MessageResult>;
  sendSms(params: SendSmsParams): Promise<MessageResult>;
}
