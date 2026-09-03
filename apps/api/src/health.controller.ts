import { Controller, Get } from '@nestjs/common';

/**
 * Deployment diagnostics deliberately contain only build metadata. They make
 * it possible to prove which compiled RetailOS instance is serving a client
 * without exposing configuration, sessions, or operational data.
 */
@Controller('health')
export class HealthController {
  @Get()
  status() {
    return {
      status: 'ok',
      service: 'retailos-api',
      build: {
        commit: process.env.RETAILOS_BUILD_COMMIT || 'unknown',
        compiledAt: process.env.RETAILOS_BUILD_COMPILED_AT || 'unknown',
      },
    };
  }
}
