import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';

export enum LogLevel {
  Debug = 0,
  Info = 1,
  Warn = 2,
  Error = 3,
  Off = 4,
}

type LogFn = (...args: unknown[]) => void;

const noop: LogFn = () => {};

@Injectable({ providedIn: 'root' })
export class LogService {
  readonly #level: LogLevel = environment.production ? LogLevel.Error : LogLevel.Debug;

  get level(): LogLevel {
    return this.#level;
  }

  // Bound directly to console so devtools shows the real caller, not log.service.ts.
  // Field order matters: #level must be declared above these so it is initialised first.
  readonly debug: LogFn = this.#level <= LogLevel.Debug ? console.debug.bind(console) : noop;
  readonly info: LogFn = this.#level <= LogLevel.Info ? console.info.bind(console) : noop;
  readonly warn: LogFn = this.#level <= LogLevel.Warn ? console.warn.bind(console) : noop;
  readonly error: LogFn = this.#level <= LogLevel.Error ? console.error.bind(console) : noop;
}
