export interface CreateLoggerOptions {
  format?: "json" | "pretty";
  level?: LogLevel;
  write?: (line: string) => void;
}

export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(event: string, message: string, fields?: LogFields): void;
  error(event: string, message: string, fields?: LogFields): void;
  info(event: string, message: string, fields?: LogFields): void;
  warn(event: string, message: string, fields?: LogFields): void;
}

export type LogLevel = "debug" | "error" | "info" | "warn";

const LEVEL_WEIGHTS: Record<LogLevel, number> = {
  debug: 10,
  error: 40,
  info: 20,
  warn: 30,
};

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const format = options.format ?? "json";
  const minimumLevel = options.level ?? "info";
  const write =
    options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const log = (
    level: LogLevel,
    event: string,
    message: string,
    fields: LogFields = {},
  ) => {
    if (LEVEL_WEIGHTS[level] < LEVEL_WEIGHTS[minimumLevel]) {
      return;
    }
    const entry = {
      event,
      level,
      msg: message,
      time: new Date().toISOString(),
      ...fields,
    };
    write(
      format === "json"
        ? JSON.stringify(entry)
        : `${entry.time} ${level.toUpperCase()} ${event} ${message} ${JSON.stringify(fields)}`,
    );
  };

  return {
    debug: (event, message, fields) => {
      log("debug", event, message, fields);
    },
    error: (event, message, fields) => {
      log("error", event, message, fields);
    },
    info: (event, message, fields) => {
      log("info", event, message, fields);
    },
    warn: (event, message, fields) => {
      log("warn", event, message, fields);
    },
  };
}

export const silentLogger: Logger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};
