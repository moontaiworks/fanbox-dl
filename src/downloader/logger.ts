import { formatWithOptions } from "node:util";

export type LogFields = Record<string, unknown>;

export type Logger = Record<
  LogLevel,
  (event: string, message?: string, fields?: LogFields) => void
> & {
  configure: (options: CreateLoggerOptions) => void;
  raw: (line: string) => void;
};

export type LogLevel = "debug" | "error" | "info" | "silent" | "trace" | "warn";

interface CreateLoggerOptions {
  format?: "json" | "pretty";
  level?: LogLevel;
  write?: (line: string) => void;
}

const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  error: 40,
  info: 20,
  silent: 0,
  trace: 5,
  warn: 30,
};

function createLogger({
  format = "json",
  level: minimumLevel = "info",
  write = (line: string) => process.stdout.write(`${line}\n`),
}: CreateLoggerOptions = {}): Logger {
  const createLogFn = (level: LogLevel) =>
    function log(event: string, message?: string, fields: LogFields = {}) {
      const levelWeight = LEVEL_WEIGHTS[level];
      if (!levelWeight || levelWeight < LEVEL_WEIGHTS[minimumLevel]) {
        return;
      }

      const payload = {
        event,
        level,
        msg: message,
        time: new Date().toISOString(),
        ...fields,
      };
      write(
        format === "json"
          ? JSON.stringify(payload)
          : `${payload.time} ${level.toUpperCase()} ${event} ${message?.concat(" ")}${formatWithOptions({ colors: true, depth: Infinity }, fields)}`,
      );
    };

  return {
    configure({
      format: newFormat = format,
      level: newMinimumLevel = minimumLevel,
      write: newWrite = write,
    }: CreateLoggerOptions) {
      format = newFormat;
      minimumLevel = newMinimumLevel;
      write = newWrite;
    },
    debug: createLogFn("debug"),
    error: createLogFn("error"),
    info: createLogFn("info"),
    raw: (line: string) => {
      write(line);
    },
    silent: createLogFn("silent"),
    trace: createLogFn("trace"),
    warn: createLogFn("warn"),
  };
}

export const logger = createLogger();
