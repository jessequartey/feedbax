import { Context } from 'effect'

export interface RequestContextValue {
  readonly requestId: string
  readonly operation: string
  readonly startedAt: number
  readonly deployment: string
}
export class RequestContext extends Context.Tag('@feedbax/RequestContext')<
  RequestContext,
  RequestContextValue
>() {}
export interface TelemetryEvent {
  readonly requestId: string
  readonly operation: string
  readonly durationMs: number
  readonly outcome: 'success' | 'failure'
  readonly errorCode?: string
  readonly retryCount: number
  readonly cacheStatus?: 'hit' | 'miss' | 'bypass'
}
export interface TelemetryService {
  readonly emit: (event: TelemetryEvent) => void
}
export class Telemetry extends Context.Tag('@feedbax/Telemetry')<
  Telemetry,
  TelemetryService
>() {}
export const consoleTelemetry: TelemetryService = {
  emit: (event) => console.info(JSON.stringify(event)),
}
