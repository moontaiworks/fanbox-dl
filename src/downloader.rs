use crate::client::{FanboxClient, FanboxClientError, ListCreatorPostsParams};
use crate::logger::Logger;
use crate::manifest::{
    AssetManifestEntry, AssetStatus, CreatorManifest, ManifestError, ManifestStore,
    PostManifestEntry, PostStatus,
};
use crate::markdown::render_post_markdown;
use crate::path::{
    assert_path_budget, create_post_directory_name, from_posix, join_posix,
    sanitize_path_component, sanitize_path_component_for_directory, PathError, SanitizeOptions,
};
use crate::scheduler::{RequestScheduler, SchedulerError, SharedScheduler};
use crate::types::{Post, PostSummary};
use futures_util::StreamExt;
use reqwest::header::{HeaderMap, HeaderValue, LAST_MODIFIED, RANGE};
use serde::Serialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::path::{Path, PathBuf};
use thiserror::Error;
use tokio::fs;
use tokio::io::AsyncWriteExt;

#[derive(Clone)]
pub struct DownloadRequest {
    pub client: FanboxClient,
    pub creator_ids: Vec<String>,
    pub following: bool,
    pub supporting: bool,
    pub ignore_creator_ids: Vec<String>,
    pub output: PathBuf,
    pub dry_run: bool,
    pub verify_assets: bool,
    pub scheduler: SharedScheduler,
    pub logger: Logger,
}

#[derive(Debug, Error)]
pub enum DownloadError {
    #[error(transparent)]
    Client(#[from] FanboxClientError),
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Manifest(#[from] ManifestError),
    #[error(transparent)]
    Path(#[from] PathError),
    #[error(transparent)]
    Scheduler(#[from] SchedulerError),
    #[error("asset download failed: {status} {url}")]
    Asset {
        status: u16,
        url: String,
        body: String,
    },
}

#[derive(Clone, Debug)]
struct AssetDescriptor {
    key: String,
    relative_path: String,
    url: String,
}

#[derive(Clone, Debug)]
struct AssetDownloadResult {
    bytes: u64,
    sha256: String,
}

pub async fn download(request: DownloadRequest) -> Result<bool, DownloadError> {
    let creator_ids = resolve_creator_ids(&request).await?;
    if request.dry_run {
        for creator_id in creator_ids {
            request.logger.info(
                "dry-run.creator",
                "Dry-run creator selected",
                serde_json::json!({ "creatorId": creator_id }),
            );
            for post in
                discover_creator_posts(&request.client, &creator_id, &request.logger).await?
            {
                request.logger.info(
                    "dry-run.post",
                    "Dry-run post discovered",
                    serde_json::json!({
                        "creatorId": creator_id,
                        "postId": post.id,
                        "restricted": post.is_restricted,
                        "title": post.title,
                        "updatedDatetime": post.updated_datetime,
                    }),
                );
            }
        }
        return Ok(false);
    }

    let mut failed = false;
    for creator_id in creator_ids {
        request.logger.info(
            "creator.sync.start",
            "Creator sync started",
            serde_json::json!({ "creatorId": creator_id }),
        );
        match sync_creator(&request, &creator_id).await {
            Ok(manifest) => {
                failed |= manifest
                    .posts
                    .values()
                    .any(|post| post.status == PostStatus::Failed);
                request.logger.info(
                    "creator.sync.complete",
                    "Creator sync completed",
                    serde_json::json!({ "creatorId": creator_id }),
                );
            }
            Err(error) => {
                failed = true;
                request.logger.error(
                    "creator.sync.failed",
                    "Creator sync failed",
                    serde_json::json!({ "creatorId": creator_id, "error": error.to_string() }),
                );
            }
        }
    }
    Ok(failed)
}

async fn resolve_creator_ids(request: &DownloadRequest) -> Result<Vec<String>, DownloadError> {
    let mut ids = BTreeSet::new();
    ids.extend(request.creator_ids.iter().cloned());
    if request.following {
        for creator in request.client.list_following_creators().await? {
            ids.insert(creator.creator_id);
        }
    }
    if request.supporting {
        for plan in request.client.list_supporting_plans().await? {
            ids.insert(plan.creator_id);
        }
    }
    for ignored in &request.ignore_creator_ids {
        ids.remove(ignored);
    }
    Ok(ids.into_iter().collect())
}

async fn discover_creator_posts(
    client: &FanboxClient,
    creator_id: &str,
    logger: &Logger,
) -> Result<Vec<PostSummary>, DownloadError> {
    const PAGE_SIZE: u32 = 300;
    let mut found = BTreeMap::new();
    let mut cursor = ListCreatorPostsParams {
        creator_id: creator_id.to_string(),
        first_id: None,
        first_published_datetime: None,
        limit: Some(PAGE_SIZE),
        sort: Some("newest".to_string()),
    };
    loop {
        let page = match client.list_creator_posts(&cursor).await {
            Ok(page) => page,
            Err(error) => {
                logger.warn(
                    "post.discovery.fallback",
                    "Direct cursor failed; using paginateCreator",
                    serde_json::json!({ "creatorId": creator_id, "error": error.to_string() }),
                );
                fallback_paginate(client, creator_id, &mut found).await?;
                break;
            }
        };
        let added = add_posts(page.clone(), &mut found);
        if page.len() < PAGE_SIZE as usize {
            break;
        }
        if added == 0 {
            logger.warn(
                "post.discovery.fallback",
                "Direct cursor made no progress; using paginateCreator",
                serde_json::json!({ "creatorId": creator_id }),
            );
            fallback_paginate(client, creator_id, &mut found).await?;
            break;
        }
        let last = page.last().expect("page is non-empty");
        cursor.first_id = Some(last.id.clone());
        cursor.first_published_datetime = Some(last.published_datetime.clone());
    }
    Ok(found.into_values().collect())
}

fn add_posts(posts: Vec<PostSummary>, found: &mut BTreeMap<String, PostSummary>) -> usize {
    let mut added = 0;
    for post in posts {
        if found.insert(post.id.clone(), post).is_none() {
            added += 1;
        }
    }
    added
}

async fn fallback_paginate(
    client: &FanboxClient,
    creator_id: &str,
    found: &mut BTreeMap<String, PostSummary>,
) -> Result<(), DownloadError> {
    for page_url in client.paginate_creator_posts(creator_id, "newest").await? {
        let parsed = url::Url::parse(&page_url).map_err(FanboxClientError::Url)?;
        let params = parsed.query_pairs().collect::<BTreeMap<_, _>>();
        let Some(creator_id) = params.get("creatorId") else {
            continue;
        };
        let cursor = ListCreatorPostsParams {
            creator_id: creator_id.to_string(),
            first_id: params.get("firstId").map(|value| value.to_string()),
            first_published_datetime: params
                .get("firstPublishedDatetime")
                .map(|value| value.to_string()),
            limit: params
                .get("limit")
                .and_then(|value| value.parse().ok())
                .or(Some(300)),
            sort: Some("newest".to_string()),
        };
        add_posts(client.list_creator_posts(&cursor).await?, found);
    }
    Ok(())
}

async fn sync_creator(
    request: &DownloadRequest,
    creator_id: &str,
) -> Result<CreatorManifest, DownloadError> {
    let store = ManifestStore::new(&request.output, creator_id)?;
    let mut manifest = store.load(creator_id).await?;
    for summary in discover_creator_posts(&request.client, creator_id, &request.logger).await? {
        sync_post(request, &store, &mut manifest, &summary).await?;
    }
    Ok(manifest)
}

async fn sync_post(
    request: &DownloadRequest,
    store: &ManifestStore,
    manifest: &mut CreatorManifest,
    summary: &PostSummary,
) -> Result<(), DownloadError> {
    let creator_directory = store.creator_directory().to_path_buf();
    let posts_parent = creator_directory.join("posts");
    let directory = join_posix(&[
        "posts",
        &create_post_directory_name(
            &summary.id,
            &summary.published_datetime,
            &summary.title,
            &posts_parent,
        )?,
    ]);
    let entry = manifest
        .posts
        .entry(summary.id.clone())
        .or_insert_with(|| PostManifestEntry {
            assets: BTreeMap::new(),
            directory: directory.clone(),
            id: summary.id.clone(),
            restricted: summary.is_restricted,
            status: PostStatus::Pending,
            updated_datetime: summary.updated_datetime.clone(),
            error: None,
        });
    if entry.directory != directory {
        let old = from_posix(&creator_directory, &entry.directory);
        let new = from_posix(&creator_directory, &directory);
        if fs::try_exists(&old).await? {
            if let Some(parent) = new.parent() {
                fs::create_dir_all(parent).await?;
            }
            fs::rename(&old, &new).await?;
        }
        let previous = entry.directory.clone();
        entry.directory = directory.clone();
        for asset in entry.assets.values_mut() {
            if let Some(rest) = asset.path.strip_prefix(&previous) {
                asset.path = format!("{directory}{rest}");
            }
        }
    }
    let post_directory = from_posix(&creator_directory, &entry.directory);
    assert_path_budget(&post_directory)?;
    fs::create_dir_all(&post_directory).await?;
    write_timestamped_json(
        &post_directory.join("summary.json"),
        summary,
        &summary.published_datetime,
    )
    .await?;
    if summary.is_restricted {
        entry.restricted = true;
        entry.status = PostStatus::Skipped;
        entry.updated_datetime = summary.updated_datetime.clone();
        store.save(manifest).await?;
        return Ok(());
    }
    let cover_changed = entry.assets.get("cover").map(|asset| asset.url.as_str())
        != summary.cover.as_ref().map(|cover| cover.url.as_str());
    if entry.status == PostStatus::Complete
        && entry.updated_datetime == summary.updated_datetime
        && !cover_changed
        && (!request.verify_assets || verify_assets(&creator_directory, entry).await?)
    {
        store.save(manifest).await?;
        return Ok(());
    }

    match request.client.get_post(&summary.id).await {
        Ok(post) => {
            let assets = list_assets(&post, &entry.directory)?;
            archive_obsolete_assets(&creator_directory, entry, &assets).await?;
            let mut paths = BTreeMap::new();
            let mut downloads = Vec::new();
            for asset in assets {
                paths.insert(asset.key.clone(), asset.relative_path.clone());
                let manifest_path = join_posix(&[&entry.directory, &asset.relative_path]);
                if entry.assets.get(&asset.key).is_some_and(|existing| {
                    existing.status == AssetStatus::Complete && existing.url == asset.url
                }) && fs::try_exists(from_posix(&creator_directory, &manifest_path)).await?
                {
                    continue;
                }
                entry.assets.insert(
                    asset.key.clone(),
                    AssetManifestEntry {
                        bytes: None,
                        error: None,
                        path: manifest_path.clone(),
                        sha256: None,
                        status: AssetStatus::Downloading,
                        url: asset.url.clone(),
                    },
                );
                downloads.push((asset, manifest_path));
            }
            for (asset, manifest_path) in downloads {
                let result = download_asset(
                    &request.scheduler,
                    &creator_directory,
                    &manifest_path,
                    &asset.url,
                    &summary.published_datetime,
                )
                .await;
                let asset_entry = entry
                    .assets
                    .get_mut(&asset.key)
                    .expect("asset entry exists");
                match result {
                    Ok(result) => {
                        asset_entry.bytes = Some(result.bytes);
                        asset_entry.sha256 = Some(result.sha256);
                        asset_entry.status = AssetStatus::Complete;
                        asset_entry.error = None;
                    }
                    Err(error) => {
                        asset_entry.error = Some(error.to_string());
                        asset_entry.status = AssetStatus::Failed;
                    }
                }
            }
            write_timestamped_json(
                &post_directory.join("metadata.json"),
                &post,
                &summary.published_datetime,
            )
            .await?;
            let markdown = render_post_markdown(&post, &paths);
            let content_path = post_directory.join("content.md");
            fs::write(&content_path, markdown).await?;
            set_file_timestamp(&content_path, &summary.published_datetime).await?;
            entry.restricted = false;
            entry.status = if entry
                .assets
                .values()
                .any(|asset| asset.status == AssetStatus::Failed)
            {
                PostStatus::Failed
            } else {
                PostStatus::Complete
            };
            entry.updated_datetime = summary.updated_datetime.clone();
            entry.error = None;
        }
        Err(error) => {
            entry.error = Some(error.to_string());
            entry.status = PostStatus::Failed;
            request.logger.error(
                "post.sync.failed",
                "Post sync failed",
                serde_json::json!({ "creatorId": summary.creator_id, "postId": summary.id, "error": error.to_string() }),
            );
        }
    }
    store.save(manifest).await?;
    Ok(())
}

fn list_assets(post: &Post, post_directory: &str) -> Result<Vec<AssetDescriptor>, DownloadError> {
    let mut assets = Vec::new();
    if let Some(url) = &post.cover_image_url {
        assets.push(AssetDescriptor {
            key: "cover".to_string(),
            relative_path: asset_path(
                post_directory,
                &format!("cover_{}", post.id),
                &extension_from_url(url, "jpg"),
            )?,
            url: url.clone(),
        });
    }
    let Some(body) = post.body_value() else {
        return Ok(assets);
    };
    match post.kind.as_str() {
        "image" => add_images(&mut assets, post_directory, body.get("images")),
        "file" => add_files(&mut assets, post_directory, body.get("files")),
        "article" => {
            add_map_images(&mut assets, post_directory, body.get("imageMap"));
            add_map_files(&mut assets, post_directory, body.get("fileMap"));
        }
        _ => {}
    }
    Ok(assets)
}

fn add_images(assets: &mut Vec<AssetDescriptor>, post_directory: &str, images: Option<&Value>) {
    if let Some(images) = images.and_then(Value::as_array) {
        for image in images {
            add_image(assets, post_directory, image);
        }
    }
}

fn add_map_images(assets: &mut Vec<AssetDescriptor>, post_directory: &str, images: Option<&Value>) {
    if let Some(images) = images.and_then(Value::as_object) {
        for image in images.values() {
            add_image(assets, post_directory, image);
        }
    }
}

fn add_image(assets: &mut Vec<AssetDescriptor>, post_directory: &str, image: &Value) {
    let Some(id) = image.get("id").and_then(Value::as_str) else {
        return;
    };
    let Some(url) = image.get("originalUrl").and_then(Value::as_str) else {
        return;
    };
    let extension = image
        .get("extension")
        .and_then(Value::as_str)
        .unwrap_or("jpg");
    if let Ok(relative_path) = asset_path(post_directory, &format!("image_{id}"), extension) {
        assets.push(AssetDescriptor {
            key: format!("image:{id}"),
            relative_path,
            url: url.to_string(),
        });
    }
}

fn add_files(assets: &mut Vec<AssetDescriptor>, post_directory: &str, files: Option<&Value>) {
    if let Some(files) = files.and_then(Value::as_array) {
        for file in files {
            add_file(assets, post_directory, file);
        }
    }
}

fn add_map_files(assets: &mut Vec<AssetDescriptor>, post_directory: &str, files: Option<&Value>) {
    if let Some(files) = files.and_then(Value::as_object) {
        for file in files.values() {
            add_file(assets, post_directory, file);
        }
    }
}

fn add_file(assets: &mut Vec<AssetDescriptor>, post_directory: &str, file: &Value) {
    let Some(id) = file.get("id").and_then(Value::as_str) else {
        return;
    };
    let Some(url) = file.get("url").and_then(Value::as_str) else {
        return;
    };
    let name = file.get("name").and_then(Value::as_str).unwrap_or(id);
    let extension = file
        .get("extension")
        .and_then(Value::as_str)
        .unwrap_or("bin");
    if let Ok(relative_path) = asset_path(post_directory, &format!("file_{id}_{name}"), extension) {
        assets.push(AssetDescriptor {
            key: format!("file:{id}"),
            relative_path,
            url: url.to_string(),
        });
    }
}

fn asset_path(post_directory: &str, name: &str, extension: &str) -> Result<String, PathError> {
    let safe_extension = sanitize_path_component(
        extension,
        SanitizeOptions {
            max_bytes: Some(16),
            ..Default::default()
        },
    );
    let directory = Path::new(post_directory).join("assets");
    Ok(join_posix(&[
        "assets",
        &sanitize_path_component_for_directory(
            name,
            &directory,
            SanitizeOptions {
                suffix: format!(".{safe_extension}"),
                ..Default::default()
            },
        )?,
    ]))
}

fn extension_from_url(url: &str, fallback: &str) -> String {
    url::Url::parse(url)
        .ok()
        .and_then(|url| {
            Path::new(url.path())
                .extension()
                .and_then(|extension| extension.to_str())
                .map(str::to_string)
        })
        .unwrap_or_else(|| fallback.to_string())
}

async fn archive_obsolete_assets(
    creator_directory: &Path,
    entry: &mut PostManifestEntry,
    assets: &[AssetDescriptor],
) -> Result<(), DownloadError> {
    let current = assets
        .iter()
        .map(|asset| asset.key.as_str())
        .collect::<BTreeSet<_>>();
    for (key, asset) in entry.assets.iter_mut() {
        if current.contains(key.as_str()) || asset.status == AssetStatus::Obsolete {
            continue;
        }
        let source = from_posix(creator_directory, &asset.path);
        let archive_directory = from_posix(creator_directory, &entry.directory).join("archived");
        fs::create_dir_all(&archive_directory).await?;
        if fs::try_exists(&source).await? {
            let destination = archive_directory.join(source.file_name().unwrap_or_default());
            fs::rename(source, destination).await?;
        }
        asset.status = AssetStatus::Obsolete;
    }
    Ok(())
}

async fn download_asset(
    scheduler: &RequestScheduler,
    root: &Path,
    relative_path: &str,
    url: &str,
    published_datetime: &str,
) -> Result<AssetDownloadResult, DownloadError> {
    let destination = from_posix(root, relative_path);
    let temporary = PathBuf::from(format!("{}.part", destination.to_string_lossy()));
    assert_path_budget(&temporary)?;
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).await?;
    }
    let partial_bytes = match fs::metadata(&temporary).await {
        Ok(metadata) => metadata.len(),
        Err(_) => 0,
    };
    let mut headers = HeaderMap::new();
    if partial_bytes > 0 {
        headers.insert(
            RANGE,
            HeaderValue::from_str(&format!("bytes={partial_bytes}-")).unwrap(),
        );
    }
    let http = reqwest::Client::new();
    let response = scheduler
        .send(|| http.get(url).headers(headers.clone()))
        .await?;
    if !response.status().is_success() {
        let status = response.status().as_u16();
        let body = response.text().await.unwrap_or_default();
        return Err(DownloadError::Asset {
            status,
            url: url.to_string(),
            body,
        });
    }
    let append = response.status() == reqwest::StatusCode::PARTIAL_CONTENT && partial_bytes > 0;
    let last_modified = response
        .headers()
        .get(LAST_MODIFIED)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);
    let mut file = fs::OpenOptions::new()
        .create(true)
        .write(true)
        .append(append)
        .truncate(!append)
        .open(&temporary)
        .await?;
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        file.write_all(&chunk?).await?;
    }
    file.flush().await?;
    fs::rename(&temporary, &destination).await?;
    set_file_timestamp(
        &destination,
        last_modified.as_deref().unwrap_or(published_datetime),
    )
    .await?;
    let bytes = fs::metadata(&destination).await?.len();
    let sha256 = hash_file(&destination).await?;
    Ok(AssetDownloadResult { bytes, sha256 })
}

async fn verify_assets(root: &Path, entry: &mut PostManifestEntry) -> Result<bool, DownloadError> {
    for asset in entry.assets.values_mut() {
        let valid = if asset.status == AssetStatus::Complete {
            match (asset.bytes, asset.sha256.as_deref()) {
                (Some(bytes), Some(sha256)) => {
                    let path = from_posix(root, &asset.path);
                    match fs::metadata(&path).await {
                        Ok(metadata) if metadata.len() == bytes => {
                            hash_file(&path).await.is_ok_and(|actual| actual == sha256)
                        }
                        _ => false,
                    }
                }
                _ => false,
            }
        } else {
            false
        };
        if !valid {
            asset.status = AssetStatus::Pending;
            return Ok(false);
        }
    }
    Ok(true)
}

async fn hash_file(path: &Path) -> Result<String, std::io::Error> {
    let bytes = fs::read(path).await?;
    Ok(hex::encode(Sha256::digest(bytes)))
}

async fn write_timestamped_json(
    path: &Path,
    value: &impl Serialize,
    timestamp: &str,
) -> Result<(), DownloadError> {
    fs::write(path, format!("{}\n", serde_json::to_string_pretty(value)?)).await?;
    set_file_timestamp(path, timestamp).await?;
    Ok(())
}

async fn set_file_timestamp(path: &Path, timestamp: &str) -> Result<(), std::io::Error> {
    let parsed = chrono::DateTime::parse_from_rfc2822(timestamp)
        .or_else(|_| chrono::DateTime::parse_from_rfc3339(timestamp));
    let Ok(parsed) = parsed else {
        return Ok(());
    };
    let time =
        filetime::FileTime::from_unix_time(parsed.timestamp(), parsed.timestamp_subsec_nanos());
    filetime::set_file_times(path, time, time)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_posts_deduplicates_by_id() {
        let user = crate::types::FanboxUser {
            icon_url: String::new(),
            name: "Creator".to_string(),
            user_id: "1".to_string(),
        };
        let post = PostSummary {
            comment_count: 0,
            cover: None,
            creator_id: "creator".to_string(),
            excerpt: String::new(),
            fee_required: 0,
            has_adult_content: false,
            id: "1".to_string(),
            is_commenting_restricted: false,
            is_liked: false,
            is_pinned: false,
            is_restricted: false,
            like_count: 0,
            published_datetime: "2026-01-01T00:00:00+09:00".to_string(),
            tags: vec![],
            title: "Title".to_string(),
            updated_datetime: "2026-01-01T00:00:00+09:00".to_string(),
            user,
        };
        let mut found = BTreeMap::new();
        assert_eq!(add_posts(vec![post.clone(), post], &mut found), 1);
        assert_eq!(found.len(), 1);
    }
}
