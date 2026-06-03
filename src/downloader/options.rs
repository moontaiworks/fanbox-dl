use std::fs;
use std::path::PathBuf;

use anyhow::{Result, anyhow, bail};
use clap::{Arg, ArgAction, Command};

use super::logger::LogFormat;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DownloadOptions {
    pub concurrency: usize,
    pub cookie: Option<String>,
    pub creator_ids: Vec<String>,
    pub dry_run: bool,
    pub following: bool,
    pub ignore_creator_ids: Vec<String>,
    pub log_format: LogFormat,
    pub max_retries: usize,
    pub output: PathBuf,
    pub rate_limit_pause_ms: u64,
    pub request_interval_ms: u64,
    pub supporting: bool,
    pub user_agent: Option<String>,
    pub verbose: bool,
    pub verify_assets: bool,
}

pub const DOWNLOAD_HELP: &str = r"Usage: fanbox-dl download [options]

Download FANBOX posts for selected creators.

Selectors:
  --creator <id>            Add a creator ID. Can be repeated.
  --following               Add all followed creators.
  --supporting              Add all supporting creators.
  --ignore-creator <id>     Exclude a creator ID. Can be repeated.

Auth:
  --cookie <value>          Raw session ID or FANBOXSESSID=... cookie.
  --cookie-file <path>      Read raw cookie or Netscape cookies.txt.
  --user-agent <value>      Send the User-Agent from your logged-in browser.
  FANBOX_SESSION_ID         Environment fallback.
  FANBOX_USER_AGENT         User-Agent environment fallback.

Download:
  --output <path>           Output directory. Default: fanbox-downloads.
  --dry-run                 List creators/posts without downloading or writing.
  --verify-assets           Verify existing asset size and SHA-256 locally.

Requests:
  --concurrency <n>         Concurrent requests. Default: 3.
  --request-interval-ms <n> Delay between request starts. Default: 0.
  --rate-limit-pause-ms <n> Pause after 429 without Retry-After. Default: 60000.
  --max-retries <n>         Retry attempts. Default: 5.

Output:
  --log-format json|pretty  Default: json.
  --verbose                 Enable debug logs.
  --help                    Show this help.
";

pub fn parse_download_options<I, T>(args: I, env: &std::collections::HashMap<String, String>) -> Result<DownloadOptions>
where
    I: IntoIterator<Item = T>,
    T: Into<std::ffi::OsString> + Clone,
{
    let args = args.into_iter().map(Into::into).collect::<Vec<_>>();
    if args.first().and_then(|arg| arg.to_str()) != Some("download") {
        bail!("expected the download command");
    }
    let command = Command::new("download")
        .disable_help_flag(true)
        .arg(Arg::new("creator").long("creator").action(ArgAction::Append).num_args(1))
        .arg(Arg::new("following").long("following").action(ArgAction::SetTrue))
        .arg(Arg::new("supporting").long("supporting").action(ArgAction::SetTrue))
        .arg(Arg::new("ignore-creator").long("ignore-creator").action(ArgAction::Append).num_args(1))
        .arg(Arg::new("cookie").long("cookie").num_args(1))
        .arg(Arg::new("cookie-file").long("cookie-file").num_args(1))
        .arg(Arg::new("user-agent").long("user-agent").num_args(1))
        .arg(Arg::new("output").long("output").num_args(1).default_value("fanbox-downloads"))
        .arg(Arg::new("dry-run").long("dry-run").action(ArgAction::SetTrue))
        .arg(Arg::new("verify-assets").long("verify-assets").action(ArgAction::SetTrue))
        .arg(Arg::new("concurrency").long("concurrency").num_args(1).default_value("3"))
        .arg(Arg::new("request-interval-ms").long("request-interval-ms").num_args(1).default_value("0"))
        .arg(Arg::new("rate-limit-pause-ms").long("rate-limit-pause-ms").num_args(1).default_value("60000"))
        .arg(Arg::new("max-retries").long("max-retries").num_args(1).default_value("5"))
        .arg(Arg::new("log-format").long("log-format").num_args(1).default_value("json"))
        .arg(Arg::new("verbose").long("verbose").action(ArgAction::SetTrue));
    let matches = command.try_get_matches_from(args).map_err(|error| anyhow!(error.to_string()))?;
    let creator_ids = matches.get_many::<String>("creator").map(|values| values.cloned().collect::<Vec<_>>()).unwrap_or_default();
    if creator_ids.is_empty() && !matches.get_flag("following") && !matches.get_flag("supporting") {
        bail!("at least one creator selector is required");
    }
    let log_format = match matches.get_one::<String>("log-format").map(String::as_str).unwrap_or("json") {
        "json" => LogFormat::Json,
        "pretty" => LogFormat::Pretty,
        _ => bail!("log-format must be json or pretty"),
    };
    let cookie_file = matches.get_one::<String>("cookie-file").map(PathBuf::from);
    let cookie = normalize_cookie(
        matches.get_one::<String>("cookie").cloned()
            .or_else(|| cookie_file.and_then(|path| fs::read_to_string(path).ok()))
            .or_else(|| env.get("FANBOX_SESSION_ID").cloned()),
    );
    Ok(DownloadOptions {
        concurrency: parse_positive_integer("concurrency", matches.get_one::<String>("concurrency").unwrap())?,
        cookie,
        creator_ids,
        dry_run: matches.get_flag("dry-run"),
        following: matches.get_flag("following"),
        ignore_creator_ids: matches.get_many::<String>("ignore-creator").map(|values| values.cloned().collect::<Vec<_>>()).unwrap_or_default(),
        log_format,
        max_retries: parse_non_negative_integer("max-retries", matches.get_one::<String>("max-retries").unwrap())?,
        output: PathBuf::from(matches.get_one::<String>("output").unwrap()),
        rate_limit_pause_ms: parse_non_negative_integer("rate-limit-pause-ms", matches.get_one::<String>("rate-limit-pause-ms").unwrap())? as u64,
        request_interval_ms: parse_non_negative_integer("request-interval-ms", matches.get_one::<String>("request-interval-ms").unwrap())? as u64,
        supporting: matches.get_flag("supporting"),
        user_agent: matches.get_one::<String>("user-agent").cloned().or_else(|| env.get("FANBOX_USER_AGENT").cloned()),
        verbose: matches.get_flag("verbose"),
        verify_assets: matches.get_flag("verify-assets"),
    })
}

fn normalize_cookie(cookie: Option<String>) -> Option<String> {
    let value = cookie?.trim().to_string();
    if value.is_empty() {
        return None;
    }
    let cookies = parse_netscape_cookies(&value);
    if !cookies.is_empty() {
        return Some(cookies.into_iter().map(|(name, value)| format!("{name}={value}")).collect::<Vec<_>>().join("; "));
    }
    Some(if value.contains('=') { value } else { format!("FANBOXSESSID={value}") })
}

fn is_fanbox_cookie_domain(domain: &str) -> bool {
    let normalized = domain.trim_start_matches('.').to_ascii_lowercase();
    normalized == "fanbox.cc" || normalized.ends_with(".fanbox.cc")
}

fn parse_netscape_cookies(value: &str) -> Vec<(String, String)> {
    value.lines().filter_map(|line| {
        if line.is_empty() || line.starts_with('#') {
            return None;
        }
        let columns = line.split('\t').collect::<Vec<_>>();
        if columns.len() < 7 || !is_fanbox_cookie_domain(columns[0]) {
            return None;
        }
        Some((columns[5].to_string(), columns[6].to_string()))
    }).collect()
}

fn parse_non_negative_integer(name: &str, value: &str) -> Result<usize> {
    let number = value.parse::<usize>().map_err(|_| anyhow!("{name} must be a non-negative integer"))?;
    Ok(number)
}

fn parse_positive_integer(name: &str, value: &str) -> Result<usize> {
    let number = parse_non_negative_integer(name, value)?;
    if number == 0 {
        bail!("{name} must be a positive integer");
    }
    Ok(number)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use tempfile::tempdir;

    use super::{DOWNLOAD_HELP, LogFormat, parse_download_options};

    #[test]
    fn parses_repeated_selectors_and_defaults() {
        let options = parse_download_options(["download", "--creator", "alpha", "--creator", "beta", "--following", "--ignore-creator", "beta"], &HashMap::new()).unwrap();
        assert_eq!(options.concurrency, 3);
        assert_eq!(options.creator_ids, vec!["alpha", "beta"]);
        assert!(options.following);
        assert_eq!(options.ignore_creator_ids, vec!["beta"]);
        assert_eq!(options.log_format, LogFormat::Json);
        assert_eq!(options.output, PathBuf::from("fanbox-downloads"));
    }

    use std::path::PathBuf;

    #[test]
    fn parses_flags() {
        let options = parse_download_options(["download", "--creator", "alpha", "--dry-run", "--verbose"], &HashMap::new()).unwrap();
        assert!(options.dry_run);
        assert!(options.verbose);
    }

    #[test]
    fn prefers_explicit_cookie() {
        let env = HashMap::from([(String::from("FANBOX_SESSION_ID"), String::from("environment"))]);
        let options = parse_download_options(["download", "--creator", "alpha", "--cookie", "explicit"], &env).unwrap();
        assert_eq!(options.cookie, Some("FANBOXSESSID=explicit".into()));
    }

    #[test]
    fn loads_netscape_cookies() {
        let directory = tempdir().unwrap();
        let cookie_file = directory.path().join("cookies.txt");
        std::fs::write(&cookie_file, ["# Netscape HTTP Cookie File", ".fanbox.cc\tTRUE\t/\tTRUE\t2147483647\tcf_clearance\tclearance", "www.fanbox.cc\tFALSE\t/\tTRUE\t2147483647\tFANBOXSESSID\tsession", ".example.test\tTRUE\t/\tTRUE\t2147483647\tignored\tnope"].join("\n")).unwrap();
        let options = parse_download_options(["download", "--creator", "alpha", "--cookie-file", cookie_file.to_str().unwrap()], &HashMap::new()).unwrap();
        assert_eq!(options.cookie, Some("cf_clearance=clearance; FANBOXSESSID=session".into()));
    }

    #[test]
    fn parses_user_agent_before_env() {
        let env = HashMap::from([(String::from("FANBOX_USER_AGENT"), String::from("env agent"))]);
        let options = parse_download_options(["download", "--creator", "alpha", "--user-agent", "cli agent"], &env).unwrap();
        assert_eq!(options.user_agent, Some("cli agent".into()));
    }

    #[test]
    fn rejects_missing_selectors() {
        assert!(parse_download_options(["download"], &HashMap::new()).is_err());
    }

    #[test]
    fn rejects_zero_concurrency() {
        assert!(parse_download_options(["download", "--creator", "alpha", "--concurrency", "0"], &HashMap::new()).is_err());
    }

    #[test]
    fn help_mentions_dry_run() {
        assert!(DOWNLOAD_HELP.contains("--dry-run"));
    }
}
