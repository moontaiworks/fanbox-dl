use std::collections::BTreeMap;
use std::sync::Arc;

use serde_json::{Map, Value, json};

#[derive(Clone, Copy, Debug, Eq, PartialEq, Ord, PartialOrd)]
pub enum LogLevel {
    Debug,
    Info,
    Warn,
    Error,
}

impl LogLevel {
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Debug => "debug",
            Self::Info => "info",
            Self::Warn => "warn",
            Self::Error => "error",
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum LogFormat {
    Json,
    Pretty,
}

pub type LogFields = Map<String, Value>;
pub type LogWriter = Arc<dyn Fn(String) + Send + Sync>;

#[derive(Clone)]
pub struct Logger {
    format: LogFormat,
    minimum_level: LogLevel,
    writer: Option<LogWriter>,
}

impl Logger {
    #[must_use]
    pub fn new(format: LogFormat, minimum_level: LogLevel, writer: LogWriter) -> Self {
        Self {
            format,
            minimum_level,
            writer: Some(writer),
        }
    }

    #[must_use]
    pub fn silent() -> Self {
        Self {
            format: LogFormat::Json,
            minimum_level: LogLevel::Error,
            writer: None,
        }
    }

    pub fn debug(&self, event: &str, message: &str, fields: LogFields) {
        self.log(LogLevel::Debug, event, message, fields);
    }

    pub fn info(&self, event: &str, message: &str, fields: LogFields) {
        self.log(LogLevel::Info, event, message, fields);
    }

    pub fn warn(&self, event: &str, message: &str, fields: LogFields) {
        self.log(LogLevel::Warn, event, message, fields);
    }

    pub fn error(&self, event: &str, message: &str, fields: LogFields) {
        self.log(LogLevel::Error, event, message, fields);
    }

    fn log(&self, level: LogLevel, event: &str, message: &str, fields: LogFields) {
        if level < self.minimum_level {
            return;
        }
        let Some(writer) = &self.writer else {
            return;
        };
        let time = chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
        let line = match self.format {
            LogFormat::Json => {
                let mut entry = fields;
                entry.insert("event".into(), json!(event));
                entry.insert("level".into(), json!(level.as_str()));
                entry.insert("msg".into(), json!(message));
                entry.insert("time".into(), json!(time));
                Value::Object(entry).to_string()
            }
            LogFormat::Pretty => {
                let ordered = BTreeMap::from_iter(fields.into_iter());
                format!("{time} {} {event} {message} {}", level.as_str().to_uppercase(), serde_json::to_string(&ordered).unwrap())
            }
        };
        writer(line);
    }
}
