use crate::client::{FanboxClient, FanboxClientOptions};
use crate::downloader::{download, DownloadRequest};
use crate::logger::{LogFormat, LogLevel, Logger};
use crate::scheduler::RequestScheduler;
use clap::{Args, Parser, Subcommand, ValueEnum};
use std::collections::BTreeMap;
use std::path::PathBuf;
use std::sync::Arc;
use thiserror::Error;

#[derive(Debug, Parser)]
#[command(name = "fanbox-dl", version, about = "Download FANBOX posts")]
pub struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    Download(DownloadArgs),
}

#[derive(Debug, Args)]
pub struct DownloadArgs {
    #[arg(long = "creator")]
    creator_ids: Vec<String>,
    #[arg(long)]
    following: bool,
    #[arg(long)]
    supporting: bool,
    #[arg(long = "ignore-creator")]
    ignore_creator_ids: Vec<String>,
    #[arg(long)]
    cookie: Option<String>,
    #[arg(long = "cookie-file")]
    cookie_file: Option<PathBuf>,
    #[arg(long = "user-agent", env = "FANBOX_USER_AGENT")]
    user_agent: Option<String>,
    #[arg(long, default_value = "fanbox-downloads")]
    output: PathBuf,
    #[arg(long)]
    dry_run: bool,
    #[arg(long = "verify-assets")]
    verify_assets: bool,
    #[arg(long, default_value_t = 3)]
    concurrency: usize,
    #[arg(long = "request-interval-ms", default_value_t = 0)]
    request_interval_ms: u64,
    #[arg(long = "rate-limit-pause-ms", default_value_t = 60_000)]
    rate_limit_pause_ms: u64,
    #[arg(long = "max-retries", default_value_t = 5)]
    max_retries: usize,
    #[arg(long = "log-format", default_value_t = CliLogFormat::Json)]
    log_format: CliLogFormat,
    #[arg(long)]
    verbose: bool,
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum CliLogFormat {
    Json,
    Pretty,
}

impl std::fmt::Display for CliLogFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Json => write!(f, "json"),
            Self::Pretty => write!(f, "pretty"),
        }
    }
}

#[derive(Debug, Error)]
pub enum CliError {
    #[error("at least one creator selector is required")]
    MissingSelector,
    #[error("{0} must be a positive integer")]
    PositiveInteger(&'static str),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Download(#[from] crate::downloader::DownloadError),
}

pub async fn run_from_env() -> i32 {
    run(std::env::args_os()).await
}

pub async fn run<I, T>(args: I) -> i32
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    let cli = match Cli::try_parse_from(args) {
        Ok(cli) => cli,
        Err(error) => {
            let code = if error.use_stderr() { 2 } else { 0 };
            let _ = error.print();
            return code;
        }
    };

    match cli.command {
        Command::Download(args) => match run_download(args).await {
            Ok(failed) => {
                if failed {
                    1
                } else {
                    0
                }
            }
            Err(error) => {
                eprintln!(
                    "{}",
                    serde_json::json!({
                        "time": chrono::Utc::now().to_rfc3339(),
                        "level": "error",
                        "event": "cli.failed",
                        "msg": error.to_string(),
                    })
                );
                if matches!(
                    error,
                    CliError::MissingSelector | CliError::PositiveInteger(_)
                ) {
                    2
                } else {
                    1
                }
            }
        },
    }
}

async fn run_download(args: DownloadArgs) -> Result<bool, CliError> {
    if args.creator_ids.is_empty() && !args.following && !args.supporting {
        return Err(CliError::MissingSelector);
    }
    if args.concurrency == 0 {
        return Err(CliError::PositiveInteger("concurrency"));
    }

    let cookie = load_cookie(args.cookie, args.cookie_file)?;
    let logger = Logger::new(
        match args.log_format {
            CliLogFormat::Json => LogFormat::Json,
            CliLogFormat::Pretty => LogFormat::Pretty,
        },
        if args.verbose {
            LogLevel::Debug
        } else {
            LogLevel::Info
        },
    );
    let scheduler = Arc::new(RequestScheduler::new(
        args.concurrency,
        args.max_retries,
        args.request_interval_ms,
        args.rate_limit_pause_ms,
        logger.clone(),
    ));
    let client = FanboxClient::new(FanboxClientOptions {
        cookie,
        logger: logger.clone(),
        scheduler: Some(scheduler.clone()),
        user_agent: args.user_agent,
        ..Default::default()
    });

    download(DownloadRequest {
        client,
        creator_ids: args.creator_ids,
        following: args.following,
        supporting: args.supporting,
        ignore_creator_ids: args.ignore_creator_ids,
        output: args.output,
        dry_run: args.dry_run,
        verify_assets: args.verify_assets,
        scheduler,
        logger,
    })
    .await
    .map_err(Into::into)
}

fn load_cookie(
    cli_cookie: Option<String>,
    cookie_file: Option<PathBuf>,
) -> Result<Option<String>, std::io::Error> {
    let raw = match (cli_cookie, cookie_file) {
        (Some(cookie), _) => Some(cookie),
        (None, Some(path)) => Some(std::fs::read_to_string(path)?),
        (None, None) => std::env::var("FANBOX_SESSION_ID").ok(),
    };
    Ok(normalize_cookie(raw.as_deref()))
}

pub fn normalize_cookie(cookie: Option<&str>) -> Option<String> {
    let value = cookie?.trim();
    if value.is_empty() {
        return None;
    }
    let cookies = parse_netscape_cookies(value);
    if !cookies.is_empty() {
        return Some(
            cookies
                .into_iter()
                .map(|(name, value)| format!("{name}={value}"))
                .collect::<Vec<_>>()
                .join("; "),
        );
    }
    if value.contains('=') {
        Some(value.to_string())
    } else {
        Some(format!("FANBOXSESSID={value}"))
    }
}

fn parse_netscape_cookies(value: &str) -> BTreeMap<String, String> {
    let mut cookies = BTreeMap::new();
    for line in value.lines() {
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let columns = line.split('\t').collect::<Vec<_>>();
        if columns.len() < 7 {
            continue;
        }
        let domain = columns[0].trim_start_matches('.').to_ascii_lowercase();
        if domain != "fanbox.cc" && !domain.ends_with(".fanbox.cc") {
            continue;
        }
        cookies.insert(columns[5].to_string(), columns[6].to_string());
    }
    cookies
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_raw_session_id() {
        assert_eq!(
            normalize_cookie(Some("abc")).as_deref(),
            Some("FANBOXSESSID=abc")
        );
    }

    #[test]
    fn preserves_cookie_header() {
        assert_eq!(
            normalize_cookie(Some("FANBOXSESSID=abc; cf_clearance=def")).as_deref(),
            Some("FANBOXSESSID=abc; cf_clearance=def")
        );
    }

    #[test]
    fn parses_netscape_fanbox_cookies() {
        let value = ".fanbox.cc\tTRUE\t/\tTRUE\t0\tFANBOXSESSID\tabc\n.example.test\tTRUE\t/\tTRUE\t0\tno\tno";
        assert_eq!(
            normalize_cookie(Some(value)).as_deref(),
            Some("FANBOXSESSID=abc")
        );
    }
}
