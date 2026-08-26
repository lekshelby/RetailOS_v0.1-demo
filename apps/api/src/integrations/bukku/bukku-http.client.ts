import { BadGatewayException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BukkuHttpClient {
  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(this.config.get<string>('BUKKU_BASE_URL') && this.config.get<string>('BUKKU_ACCESS_TOKEN') && this.config.get<string>('BUKKU_COMPANY_SUBDOMAIN'));
  }

  async get(path: string) { return this.request(path, { method: 'GET' }); }
  async post(path: string, body: unknown) { return this.request(path, { method: 'POST', body: JSON.stringify(body) }); }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const baseUrl = this.config.get<string>('BUKKU_BASE_URL');
    const token = this.config.get<string>('BUKKU_ACCESS_TOKEN');
    const subdomain = this.config.get<string>('BUKKU_COMPANY_SUBDOMAIN');
    if (!baseUrl || !token || !subdomain) throw new ServiceUnavailableException('Bukku staging configuration is incomplete');
    let response: Response;
    try {
      response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, { ...init, headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'Company-Subdomain': subdomain } });
    } catch {
      throw new BadGatewayException('Bukku is unreachable');
    }
    const text = await response.text();
    let payload: unknown = text;
    try { payload = text ? JSON.parse(text) : {}; } catch { /* preserve non-JSON gateway diagnostics internally */ }
    if (!response.ok) throw new BadGatewayException({ message: 'Bukku request failed', status: response.status });
    return payload;
  }
}
