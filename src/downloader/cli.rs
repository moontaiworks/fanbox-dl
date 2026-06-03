use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use anyhow::Result;
use serde_json::json;

use crate::client::FanboxClient;
use crate::http::{HttpClient, ReqwestHttpClient};

use super::asset::AssetDownloader;
use super::discovery::discover_creator_posts;
use super::errors::log_debug_error_response;
use super::logger::{LogFields, LogLevel, Logger};
use super::options::{DOWNLOAD_HELP, parse_download_options};
use super::path::assert_path_budget;
use super::resolver::resolve_creator_ids;
use super::scheduler::RequestScheduler;
use super::sync::sync_creator;

pub fn run_cli(args: Vec<std::ffi::OsString>, env: HashMap<String, String>, http: Option<Arc<dyn HttpClient>>, writer: Arc<dyn Fn(String) + Send + Sync>) -> i32 {
    if args.iter().any(|arg| arg == "--help" || arg == "-h") {
        writer(DOWNLOAD_HELP.to_string());
        return 0;
    }
    let runtime = tokio::runtime::Runtime::new().expect("runtime");
    runtime.block_on(async move {
        match run(args, env, http.unwrap_or_else(|| Arc::new(ReqwestHttpClient::new())), writer).await {
            Ok(code) => code,
            Err(error) => {
                let value = json!({ "event": "cli.failed", "level": "error", "msg": error.to_string(), "time": chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true) });
                eprintln!("{value}");
                1
            }
        }
    })
}

async fn run(args: Vec<std::ffi::OsString>, env: HashMap<String, String>, http: Arc<dyn HttpClient>, writer: Arc<dyn Fn(String) + Send + Sync>) -> Result<i32> {
    let options = match parse_download_options(args, &env) {
        Ok(options) => options,
        Err(error) => {
            writer(format!("{}\n\n{}", error, DOWNLOAD_HELP));
            return Ok(2);
        }
    };
    assert_path_budget(&options.output, 240)?;
    let logger = Logger::new(options.log_format, if options.verbose { LogLevel::Debug } else { LogLevel::Info }, writer.clone());
    let scheduler = RequestScheduler::with_hooks(options.concurrency, logger.clone(), options.max_retries, Arc::new(|| chrono::Utc::now().timestamp_millis() as u64), options.rate_limit_pause_ms, options.request_interval_ms, Arc::new(|milliseconds| Box::pin(tokio::time::sleep(std::time::Duration::from_millis(milliseconds)))));
    let client = FanboxClient::new(None, options.cookie.clone(), Arc::clone(&http), scheduler.clone(), options.user_agent.clone())?;
    let creator_ids = resolve_creator_ids(&client, &options).await?;
    if options.dry_run {
        for creator_id in creator_ids {
            logger.info("dry-run.creator", "Dry-run creator selected", LogFields::from_iter([(String::from("creatorId"), json!(creator_id))]));
            for post in discover_creator_posts(&client, &creator_id, &logger, None).await? {
                logger.info("dry-run.post", "Dry-run post discovered", LogFields::from_iter([
                    (String::from("creatorId"), json!(creator_id)),
                    (String::from("postId"), json!(post.id)),
                    (String::from("restricted"), json!(post.is_restricted)),
                    (String::from("title"), json!(post.title)),
                    (String::from("updatedDatetime"), json!(post.updated_datetime)),
                ]));
            }
        }
        return Ok(0);
    }
    let asset_downloader = AssetDownloader::new(http, scheduler);
    let mut failed = false;
    for creator_id in creator_ids {
        logger.info("creator.sync.start", "Creator sync started", LogFields::from_iter([(String::from("creatorId"), json!(creator_id))]));
        match sync_creator(&asset_downloader, &client, &creator_id, &options.output, options.verify_assets, &logger).await {
            Ok(manifest) => {
                failed |= manifest.posts.values().any(|post| matches!(post.status, super::manifest::PostStatus::Failed));
                logger.info("creator.sync.complete", "Creator sync completed", LogFields::from_iter([(String::from("creatorId"), json!(creator_id))]));
            }
            Err(error) => {
                if let Some(source) = error.source() {
                    log_debug_error_response(&logger, source, LogFields::from_iter([(String::from("creatorId"), json!(creator_id))]));
                }
                failed = true;
                logger.error("creator.sync.failed", "Creator sync failed", LogFields::from_iter([(String::from("creatorId"), json!(creator_id)), (String::from("error"), json!(error.to_string()))]));
            }
        }
    }
    Ok(if failed { 1 } else { 0 })
}
