use serde::Serialize;
use serde_json::{json, Value};

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

#[derive(Clone, Debug)]
pub struct Logger {
    format: LogFormat,
    level: LogLevel,
}

impl Logger {
    pub fn new(format: LogFormat, level: LogLevel) -> Self {
        Self { format, level }
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
                eprintln!("{}", line);
            }
            LogFormat::Pretty => {
                if data == Value::Object(Default::default()) {
                    eprintln!("[{}] {}: {}", level.as_str(), event, msg);
                } else {
                    eprintln!("[{}] {}: {} {}", level.as_str(), event, msg, data);
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

    #[test]
    fn log_levels_order_by_severity() {
        assert!(LogLevel::Debug < LogLevel::Info);
        assert!(LogLevel::Warn < LogLevel::Error);
    }
}
