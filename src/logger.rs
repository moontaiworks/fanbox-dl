use serde::Serialize;
use serde_json::{json, Value};
use std::sync::Arc;

type LogSink = Arc<dyn Fn(&str) + Send + Sync>;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LogFormat {
    Json,
    Pretty,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

#[derive(Clone)]
pub struct Logger {
    format: LogFormat,
    level: LogLevel,
    sink: LogSink,
}

impl std::fmt::Debug for Logger {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Logger")
            .field("format", &self.format)
            .field("level", &self.level)
            .finish_non_exhaustive()
    }
}

impl Logger {
    pub fn new(format: LogFormat, level: LogLevel) -> Self {
        Self::with_sink(format, level, Arc::new(|line| eprintln!("{}", line)))
    }

    pub fn with_sink(format: LogFormat, level: LogLevel, sink: LogSink) -> Self {
        Self {
            format,
            level,
            sink,
        }
    }

    pub fn debug(&self, event: &str, msg: &str, data: impl Serialize) {
        self.log(LogLevel::Debug, event, msg, data);
    }

    pub fn info(&self, event: &str, msg: &str, data: impl Serialize) {
        self.log(LogLevel::Info, event, msg, data);
    }

    pub fn warn(&self, event: &str, msg: &str, data: impl Serialize) {
        self.log(LogLevel::Warn, event, msg, data);
    }

    pub fn error(&self, event: &str, msg: &str, data: impl Serialize) {
        self.log(LogLevel::Error, event, msg, data);
    }

    fn log(&self, level: LogLevel, event: &str, msg: &str, data: impl Serialize) {
        if level < self.level {
            return;
        }
        let data = serde_json::to_value(data).unwrap_or_else(|_| json!({}));
        match self.format {
            LogFormat::Json => {
                let mut line = json!({
                    "time": chrono::Utc::now().to_rfc3339(),
                    "level": level.as_str(),
                    "event": event,
                    "msg": msg,
                });
                merge_object(&mut line, data);
                (self.sink)(&line.to_string());
            }
            LogFormat::Pretty => {
                if data == Value::Object(Default::default()) {
                    (self.sink)(&format!("[{}] {}: {}", level.as_str(), event, msg));
                } else {
                    (self.sink)(&format!("[{}] {}: {} {}", level.as_str(), event, msg, data));
                }
            }
        }
    }
}

impl Default for Logger {
    fn default() -> Self {
        Self::new(LogFormat::Json, LogLevel::Info)
    }
}

impl LogLevel {
    fn as_str(self) -> &'static str {
        match self {
            Self::Debug => "debug",
            Self::Info => "info",
            Self::Warn => "warn",
            Self::Error => "error",
        }
    }
}

fn merge_object(target: &mut Value, data: Value) {
    let Some(target) = target.as_object_mut() else {
        return;
    };
    let Value::Object(data) = data else {
        return;
    };
    for (key, value) in data {
        target.insert(key, value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[test]
    fn log_levels_order_by_severity() {
        assert!(LogLevel::Debug < LogLevel::Info);
        assert!(LogLevel::Warn < LogLevel::Error);
    }

    #[test]
    fn writes_json_logs_to_configured_sink() {
        let lines = Arc::new(Mutex::new(Vec::new()));
        let sink = lines.clone();
        let logger = Logger::with_sink(
            LogFormat::Json,
            LogLevel::Info,
            Arc::new(move |line| sink.lock().unwrap().push(line.to_string())),
        );

        logger.info(
            "thing.complete",
            "Thing completed",
            serde_json::json!({ "id": "123" }),
        );

        let lines = lines.lock().unwrap();
        assert_eq!(lines.len(), 1);
        let line: Value = serde_json::from_str(&lines[0]).unwrap();
        assert_eq!(line["level"], "info");
        assert_eq!(line["event"], "thing.complete");
        assert_eq!(line["msg"], "Thing completed");
        assert_eq!(line["id"], "123");
    }
}
