use std::collections::{BTreeMap, HashMap};
use std::path::{Path, PathBuf};

use anyhow::Result;
use serde_json::json;
use sha2::{Digest, Sha256};

use crate::client::FanboxClient;
use crate::types::{Post, PostFile, PostImage, PostSummary};

use super::asset::AssetDownloader;
use super::discovery::discover_creator_posts;
use super::errors::log_debug_error_response;
use super::logger::{LogFields, Logger};
use super::manifest::{
    AssetManifestEntry, AssetStatus, CreatorManifest, ManifestStore, PostManifestEntry, PostStatus,
};
use super::markdown::render_post_markdown;
use super::path::{
    SanitizePathComponentOptions, assert_path_budget, create_creator_directory_name,
    create_post_directory_name, sanitize_path_component, sanitize_path_component_for_directory,
};

#[derive(Clone, Debug)]
struct AssetDescriptor {
    key: String,
    relative_path: PathBuf,
    url: String,
}

pub async fn sync_creator(
    asset_downloader: &AssetDownloader,
    client: &FanboxClient,
    creator_id: &str,
    output_directory: &Path,
    verify_assets: bool,
    logger: &Logger,
) -> Result<CreatorManifest> {
    let store = ManifestStore::new(output_directory, creator_id)?;
    let mut manifest = store.load().await?;
    for summary in discover_creator_posts(client, creator_id, logger, None).await? {
        sync_post(
            asset_downloader,
            client,
            creator_id,
            output_directory,
            verify_assets,
            logger,
            &mut manifest,
            &store,
            summary,
        )
        .await?;
    }
    Ok(manifest)
}

#[allow(clippy::too_many_arguments)]
async fn sync_post(
    asset_downloader: &AssetDownloader,
    client: &FanboxClient,
    creator_id: &str,
    output_directory: &Path,
    verify_assets: bool,
    logger: &Logger,
    manifest: &mut CreatorManifest,
    store: &ManifestStore,
    summary: PostSummary,
) -> Result<()> {
    let creator_directory =
        output_directory.join(create_creator_directory_name(creator_id, output_directory)?);
    let directory = PathBuf::from("posts").join(create_post_directory_name(
        &summary.id,
        &summary.published_datetime,
        &summary.title,
        Some(&creator_directory.join("posts")),
    )?);
    let entry = manifest
        .posts
        .entry(summary.id.clone())
        .or_insert_with(|| PostManifestEntry {
            assets: BTreeMap::new(),
            directory: directory.to_string_lossy().into_owned(),
            error: None,
            id: summary.id.clone(),
            restricted: summary.is_restricted,
            status: PostStatus::Pending,
            updated_datetime: summary.updated_datetime.clone(),
        });
    if entry.directory != directory.to_string_lossy() {
        let old_directory = creator_directory.join(&entry.directory);
        if tokio::fs::metadata(&old_directory).await.is_ok() {
            let new_directory = creator_directory.join(&directory);
            if let Some(parent) = new_directory.parent() {
                tokio::fs::create_dir_all(parent).await?;
            }
            tokio::fs::rename(&old_directory, &new_directory).await?;
        }
        for asset in entry.assets.values_mut() {
            if asset.path.starts_with(&entry.directory) {
                asset.path = format!(
                    "{}{}",
                    directory.to_string_lossy(),
                    &asset.path[entry.directory.len()..]
                );
            }
        }
        entry.directory = directory.to_string_lossy().into_owned();
    }
    let post_directory = creator_directory.join(&entry.directory);
    assert_path_budget(&post_directory, 240)?;
    tokio::fs::create_dir_all(&post_directory).await?;
    write_timestamped_json(
        &post_directory.join("summary.json"),
        &summary,
        &summary.published_datetime,
    )
    .await?;
    if summary.is_restricted {
        entry.restricted = true;
        entry.status = PostStatus::Skipped;
        entry.updated_datetime = summary.updated_datetime;
        store.save(manifest).await?;
        return Ok(());
    }
    let cover_changed = entry.assets.get("cover").map(|asset| asset.url.as_str())
        != summary.cover.as_ref().map(|cover| cover.url.as_str());
    if matches!(entry.status, PostStatus::Complete)
        && entry.updated_datetime == summary.updated_datetime
        && !cover_changed
    {
        if !verify_assets || verify_asset_entries(&creator_directory, entry).await? {
            store.save(manifest).await?;
            return Ok(());
        }
        entry.status = PostStatus::Pending;
    }
    match client
        .get_post(crate::types::GetPostParams {
            post_id: summary.id.clone(),
        })
        .await
    {
        Ok(post) => {
            let assets = list_assets(&post, &post_directory);
            let (paths, pending) = {
                archive_obsolete_assets(&creator_directory, entry, &assets).await?;
                let mut paths = HashMap::new();
                let mut pending = Vec::new();
                for asset in assets {
                    paths.insert(
                        asset.key.clone(),
                        asset.relative_path.to_string_lossy().into_owned(),
                    );
                    let manifest_path = PathBuf::from(&entry.directory).join(&asset.relative_path);
                    if let Some(existing) = entry.assets.get(&asset.key)
                        && matches!(existing.status, AssetStatus::Complete)
                        && existing.url == asset.url
                        && tokio::fs::metadata(creator_directory.join(&existing.path))
                            .await
                            .is_ok()
                    {
                        continue;
                    }
                    entry.assets.insert(
                        asset.key.clone(),
                        AssetManifestEntry {
                            bytes: None,
                            error: None,
                            path: manifest_path.to_string_lossy().into_owned(),
                            sha256: None,
                            status: AssetStatus::Downloading,
                            url: asset.url.clone(),
                        },
                    );
                    pending.push(asset);
                }
                (paths, pending)
            };
            store.save(manifest).await?;
            for asset in pending {
                let entry = manifest.posts.get_mut(&summary.id).unwrap();
                let asset_entry = entry.assets.get_mut(&asset.key).unwrap();
                match asset_downloader
                    .download(
                        &summary.published_datetime,
                        &creator_directory,
                        Path::new(&asset_entry.path),
                        &asset.url,
                    )
                    .await
                {
                    Ok(result) => {
                        asset_entry.bytes = Some(result.bytes);
                        asset_entry.sha256 = Some(result.sha256);
                        asset_entry.status = AssetStatus::Complete;
                        logger.info(
                            "asset.download.complete",
                            "Asset downloaded",
                            LogFields::from_iter([
                                (String::from("assetId"), json!(asset.key)),
                                (String::from("bytes"), json!(asset_entry.bytes)),
                                (String::from("creatorId"), json!(creator_id)),
                                (String::from("postId"), json!(summary.id)),
                            ]),
                        );
                    }
                    Err(error) => {
                        if let Some(source) = error.source() {
                            log_debug_error_response(
                                logger,
                                source,
                                LogFields::from_iter([
                                    (String::from("assetId"), json!(asset.key)),
                                    (String::from("creatorId"), json!(creator_id)),
                                    (String::from("postId"), json!(summary.id)),
                                ]),
                            );
                        }
                        asset_entry.error = Some(error.to_string());
                        asset_entry.status = AssetStatus::Failed;
                        logger.error(
                            "asset.download.failed",
                            "Asset download failed",
                            LogFields::from_iter([
                                (String::from("assetId"), json!(asset.key)),
                                (String::from("creatorId"), json!(creator_id)),
                                (String::from("error"), json!(error.to_string())),
                                (String::from("postId"), json!(summary.id)),
                            ]),
                        );
                    }
                }
            }
            write_timestamped_json(
                &post_directory.join("metadata.json"),
                &post,
                &summary.published_datetime,
            )
            .await?;
            tokio::fs::write(
                post_directory.join("content.md"),
                render_post_markdown(&post, &paths),
            )
            .await?;
            let published =
                chrono::DateTime::parse_from_rfc3339(&summary.published_datetime)?.timestamp();
            filetime::set_file_times(
                post_directory.join("content.md"),
                filetime::FileTime::from_unix_time(published, 0),
                filetime::FileTime::from_unix_time(published, 0),
            )?;
            let entry = manifest.posts.get_mut(&summary.id).unwrap();
            entry.restricted = false;
            entry.status = if entry
                .assets
                .values()
                .any(|asset| matches!(asset.status, AssetStatus::Failed))
            {
                PostStatus::Failed
            } else {
                PostStatus::Complete
            };
            entry.updated_datetime = summary.updated_datetime;
        }
        Err(error) => {
            if let Some(source) = error.source() {
                log_debug_error_response(
                    logger,
                    source,
                    LogFields::from_iter([
                        (String::from("creatorId"), json!(creator_id)),
                        (String::from("postId"), json!(summary.id)),
                    ]),
                );
            }
            entry.error = Some(error.to_string());
            entry.status = PostStatus::Failed;
            logger.error(
                "post.sync.failed",
                "Post sync failed",
                LogFields::from_iter([
                    (String::from("creatorId"), json!(creator_id)),
                    (String::from("error"), json!(error.to_string())),
                    (String::from("postId"), json!(summary.id)),
                ]),
            );
        }
    }
    store.save(manifest).await?;
    Ok(())
}

async fn archive_obsolete_assets(
    creator_directory: &Path,
    post_entry: &mut PostManifestEntry,
    assets: &[AssetDescriptor],
) -> Result<()> {
    let current = assets
        .iter()
        .map(|asset| asset.key.clone())
        .collect::<std::collections::BTreeSet<_>>();
    for (key, entry) in &mut post_entry.assets {
        if !current.contains(key) && !matches!(entry.status, AssetStatus::Obsolete) {
            let source = creator_directory.join(&entry.path);
            let archive_directory = creator_directory
                .join(&post_entry.directory)
                .join("archived");
            tokio::fs::create_dir_all(&archive_directory).await?;
            if tokio::fs::metadata(&source).await.is_ok() {
                tokio::fs::rename(
                    &source,
                    archive_directory.join(Path::new(&entry.path).file_name().unwrap()),
                )
                .await?;
            }
            entry.status = AssetStatus::Obsolete;
        }
    }
    Ok(())
}

fn asset_path(post_directory: &Path, name: &str, extension: &str) -> String {
    let safe_extension = sanitize_path_component(
        extension,
        SanitizePathComponentOptions {
            max_bytes: Some(16),
            ..SanitizePathComponentOptions::default()
        },
    );
    PathBuf::from("assets")
        .join(
            sanitize_path_component_for_directory(
                name,
                &post_directory.join("assets"),
                SanitizePathComponentOptions {
                    suffix: Some(format!(".{safe_extension}")),
                    ..SanitizePathComponentOptions::default()
                },
            )
            .unwrap(),
        )
        .to_string_lossy()
        .into_owned()
}

fn extension_from_url(url: &str, fallback: &str) -> String {
    Path::new(
        url::Url::parse(url)
            .ok()
            .and_then(|parsed| {
                parsed
                    .path_segments()
                    .and_then(|mut segments| segments.next_back().map(ToOwned::to_owned))
            })
            .unwrap_or_default()
            .as_str(),
    )
    .extension()
    .and_then(|ext| ext.to_str())
    .unwrap_or(fallback)
    .to_string()
}

fn list_assets(post: &Post, post_directory: &Path) -> Vec<AssetDescriptor> {
    let mut assets = Vec::new();
    if let Some(cover_image_url) = &post.cover_image_url {
        assets.push(AssetDescriptor {
            key: String::from("cover"),
            relative_path: PathBuf::from(asset_path(
                post_directory,
                &format!("cover_{}", post.id),
                &extension_from_url(cover_image_url, "jpg"),
            )),
            url: cover_image_url.clone(),
        });
    }
    match post.post_type.as_str() {
        "image" => {
            if let Some(body) = post.image_body() {
                for image in body.images {
                    assets.push(image_asset(post_directory, &image));
                }
            }
        }
        "file" => {
            if let Some(body) = post.file_body() {
                for file in body.files {
                    assets.push(file_asset(post_directory, &file));
                }
            }
        }
        "article" => {
            if let Some(body) = post.article_body() {
                for image in body.image_map.into_values() {
                    assets.push(image_asset(post_directory, &image));
                }
                for file in body.file_map.into_values() {
                    assets.push(file_asset(post_directory, &file));
                }
            }
        }
        _ => {}
    }
    assets
}

fn image_asset(post_directory: &Path, image: &PostImage) -> AssetDescriptor {
    AssetDescriptor {
        key: format!("image:{}", image.id),
        relative_path: PathBuf::from(asset_path(
            post_directory,
            &format!("image_{}", image.id),
            &image.extension,
        )),
        url: image.original_url.clone(),
    }
}

fn file_asset(post_directory: &Path, file: &PostFile) -> AssetDescriptor {
    AssetDescriptor {
        key: format!("file:{}", file.id),
        relative_path: PathBuf::from(asset_path(
            post_directory,
            &format!("file_{}_{}", file.id, file.name),
            &file.extension,
        )),
        url: file.url.clone(),
    }
}

async fn verify_asset_entries(
    creator_directory: &Path,
    entry: &mut PostManifestEntry,
) -> Result<bool> {
    for asset in entry.assets.values_mut() {
        if !matches!(asset.status, AssetStatus::Complete)
            || asset.bytes.is_none()
            || asset.sha256.is_none()
        {
            asset.status = AssetStatus::Pending;
            return Ok(false);
        }
        let file_path = creator_directory.join(&asset.path);
        let bytes = match tokio::fs::read(&file_path).await {
            Ok(bytes) => bytes,
            Err(_) => {
                asset.status = AssetStatus::Pending;
                return Ok(false);
            }
        };
        if bytes.len() as u64 != asset.bytes.unwrap()
            || format!("{:x}", Sha256::digest(&bytes)) != asset.sha256.clone().unwrap()
        {
            asset.status = AssetStatus::Pending;
            return Ok(false);
        }
    }
    Ok(true)
}

async fn write_timestamped_json(
    path: &Path,
    value: &impl serde::Serialize,
    timestamp: &str,
) -> Result<()> {
    tokio::fs::write(path, format!("{}\n", serde_json::to_string_pretty(value)?)).await?;
    let timestamp = chrono::DateTime::parse_from_rfc3339(timestamp)?.timestamp();
    filetime::set_file_times(
        path,
        filetime::FileTime::from_unix_time(timestamp, 0),
        filetime::FileTime::from_unix_time(timestamp, 0),
    )?;
    Ok(())
}
