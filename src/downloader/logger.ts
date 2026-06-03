export interface CreateLoggerOptions {
  format?: "json" | "pretty";
  write?: (line: string) => void;
}

export type LogFields = Record<string, unknown>;

export interface Logger {
  error(event: string, message: string, fields?: LogFields): void;
  info(event: string, message: string, fields?: LogFields): void;
  warn(event: string, message: string, fields?: LogFields): void;
}

export type LogLevel = "error" | "info" | "warn";

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const format = options.format ?? "json";
  const write =
    options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const log = (
    level: LogLevel,
    event: string,
    message: string,
    fields: LogFields = {},
  ) => {
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
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};
