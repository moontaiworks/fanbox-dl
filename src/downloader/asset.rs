use std::fmt::{Display, Formatter};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::{Result, anyhow};
use filetime::FileTime;
use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::http::{HttpClient, HttpRequest};

use super::scheduler::RequestScheduler;

#[derive(Clone)]
pub struct AssetDownloader {
    http: Arc<dyn HttpClient>,
    scheduler: RequestScheduler,
}

#[derive(Clone, Debug)]
pub struct AssetDownloadResult {
    pub bytes: u64,
    pub sha256: String,
}

#[derive(Clone, Debug)]
pub struct AssetDownloadError {
    pub body: Value,
    pub status: u16,
    pub status_text: String,
    pub url: String,
}

impl Display for AssetDownloadError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "Asset download failed: {} {}", self.status, self.url)
    }
}

impl std::error::Error for AssetDownloadError {}

impl AssetDownloader {
    #[must_use]
    pub fn new(http: Arc<dyn HttpClient>, scheduler: RequestScheduler) -> Self {
        Self { http, scheduler }
    }

    pub async fn download(
        &self,
        published_datetime: &str,
        root_directory: &Path,
        relative_path: &Path,
        url: &str,
    ) -> Result<AssetDownloadResult> {
        let destination = root_directory.join(relative_path);
        let temporary_path = PathBuf::from(format!("{}.part", destination.display()));
        super::path::assert_path_budget(&temporary_path, 240)?;
        if let Some(parent) = destination.parent() {
            tokio::fs::create_dir_all(parent).await?;
        }
        let partial_bytes = tokio::fs::metadata(&temporary_path)
            .await
            .map(|meta| meta.len())
            .unwrap_or(0);
        let mut request = HttpRequest::get(url.parse()?);
        if partial_bytes > 0 {
            request
                .headers
                .insert("Range", format!("bytes={partial_bytes}-").parse()?);
        }
        let http = Arc::clone(&self.http);
        let response = self
            .scheduler
            .fetch(move || {
                let http = Arc::clone(&http);
                let request = request.clone();
                async move { http.execute(request).await }
            })
            .await?;
        if !response.is_success() {
            return Err(anyhow!(AssetDownloadError {
                body: response.json_or_text(),
                status: response.status,
                status_text: response.status_text,
                url: url.to_string(),
            }));
        }
        let bytes = if response.status == 206 && partial_bytes > 0 {
            let mut existing = tokio::fs::read(&temporary_path).await.unwrap_or_default();
            existing.extend_from_slice(&response.body);
            existing
        } else {
            response.body
        };
        tokio::fs::write(&temporary_path, &bytes).await?;
        tokio::fs::rename(&temporary_path, &destination).await?;
        let timestamp = response
            .headers
            .get("Last-Modified")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| {
                chrono::DateTime::parse_from_rfc2822(value)
                    .ok()
                    .map(|date| date.timestamp())
            })
            .unwrap_or(chrono::DateTime::parse_from_rfc3339(published_datetime)?.timestamp());
        filetime::set_file_times(
            &destination,
            FileTime::from_unix_time(timestamp, 0),
            FileTime::from_unix_time(timestamp, 0),
        )?;
        let digest = Sha256::digest(&bytes);
        Ok(AssetDownloadResult {
            bytes: bytes.len() as u64,
            sha256: format!("{digest:x}"),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use anyhow::Result;
    use reqwest::header::HeaderMap;
    use sha2::{Digest, Sha256};
    use tempfile::tempdir;

    use crate::http::{HttpResponse, RecordingHttpClient};

    use super::*;

    fn sha256(value: &str) -> String {
        format!("{:x}", Sha256::digest(value.as_bytes()))
    }

    #[tokio::test]
    async fn resumes_partial_asset_with_range_request() -> Result<()> {
        let directory = tempdir()?;
        let destination = directory.path().join("assets/image.png");
        tokio::fs::create_dir_all(destination.parent().unwrap()).await?;
        tokio::fs::write(format!("{}.part", destination.display()), b"abc").await?;
        let mut headers = HeaderMap::new();
        headers.insert(
            "Last-Modified",
            "Wed, 27 May 2026 12:17:41 GMT".parse().unwrap(),
        );
        let http = RecordingHttpClient::new(vec![Ok(HttpResponse {
            body: b"def".to_vec(),
            headers,
            status: 206,
            status_text: "Partial Content".into(),
        })]);
        let downloader = AssetDownloader::new(Arc::new(http.clone()), RequestScheduler::new(1));
        let result = downloader
            .download(
                "2026-05-27T21:17:41+09:00",
                directory.path(),
                Path::new("assets/image.png"),
                "https://example.test/image.png",
            )
            .await?;
        assert_eq!(
            http.requests.lock().unwrap()[0]
                .headers
                .get("Range")
                .unwrap(),
            "bytes=3-"
        );
        assert_eq!(tokio::fs::read_to_string(&destination).await?, "abcdef");
        assert_eq!(result.bytes, 6);
        assert_eq!(result.sha256, sha256("abcdef"));
        Ok(())
    }

    #[tokio::test]
    async fn restarts_partial_asset_when_server_returns_full_response() -> Result<()> {
        let directory = tempdir()?;
        let destination = directory.path().join("asset.bin");
        tokio::fs::write(format!("{}.part", destination.display()), b"old").await?;
        let http = RecordingHttpClient::new(vec![Ok(HttpResponse {
            body: b"new".to_vec(),
            headers: HeaderMap::new(),
            status: 200,
            status_text: "OK".into(),
        })]);
        let downloader = AssetDownloader::new(Arc::new(http), RequestScheduler::new(1));
        downloader
            .download(
                "2026-05-27T21:17:41+09:00",
                directory.path(),
                Path::new("asset.bin"),
                "https://example.test/asset.bin",
            )
            .await?;
        assert_eq!(tokio::fs::read_to_string(&destination).await?, "new");
        Ok(())
    }

    #[tokio::test]
    async fn rejects_asset_path_over_budget() {
        let directory = tempdir().unwrap();
        let http = RecordingHttpClient::new(vec![Ok(HttpResponse {
            body: b"data".to_vec(),
            headers: HeaderMap::new(),
            status: 200,
            status_text: "OK".into(),
        })]);
        let downloader = AssetDownloader::new(Arc::new(http), RequestScheduler::new(1));
        assert!(
            downloader
                .download(
                    "2026-05-27T21:17:41+09:00",
                    directory.path(),
                    Path::new(&format!("{}.bin", "x".repeat(300))),
                    "https://example.test/asset.bin"
                )
                .await
                .is_err()
        );
    }
}
