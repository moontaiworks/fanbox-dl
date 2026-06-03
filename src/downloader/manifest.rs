use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::path::create_creator_directory_name;

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct AssetManifestEntry {
    pub bytes: Option<u64>,
    pub error: Option<String>,
    pub path: String,
    pub sha256: Option<String>,
    pub status: AssetStatus,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AssetStatus {
    Complete,
    Downloading,
    Failed,
    Obsolete,
    Pending,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct CreatorManifest {
    #[serde(rename = "creatorId")]
    pub creator_id: String,
    pub posts: BTreeMap<String, PostManifestEntry>,
    #[serde(rename = "schemaVersion")]
    pub schema_version: u8,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PostManifestEntry {
    pub assets: BTreeMap<String, AssetManifestEntry>,
    pub directory: String,
    pub error: Option<String>,
    pub id: String,
    pub restricted: bool,
    pub status: PostStatus,
    #[serde(rename = "updatedDatetime")]
    pub updated_datetime: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PostStatus {
    Complete,
    Failed,
    Pending,
    Skipped,
}

pub struct ManifestStore {
    creator_directory: PathBuf,
    manifest_path: PathBuf,
}

impl ManifestStore {
    pub fn new(output_directory: &Path, creator_id: &str) -> anyhow::Result<Self> {
        let creator_directory =
            output_directory.join(create_creator_directory_name(creator_id, output_directory)?);
        let manifest_path = creator_directory.join("manifest.json");
        Ok(Self {
            creator_directory,
            manifest_path,
        })
    }

    pub async fn load(&self) -> anyhow::Result<CreatorManifest> {
        match tokio::fs::read_to_string(&self.manifest_path).await {
            Ok(contents) => Ok(serde_json::from_str(&contents)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(CreatorManifest {
                creator_id: self
                    .creator_directory
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .into_owned(),
                posts: BTreeMap::new(),
                schema_version: 1,
            }),
            Err(error) => Err(error.into()),
        }
    }

    pub async fn save(&self, manifest: &CreatorManifest) -> anyhow::Result<()> {
        tokio::fs::create_dir_all(&self.creator_directory).await?;
        let temporary_path = self.manifest_path.with_extension("json.tmp");
        tokio::fs::write(
            &temporary_path,
            format!("{}\n", serde_json::to_string_pretty(manifest)?),
        )
        .await?;
        tokio::fs::rename(&temporary_path, &self.manifest_path).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::{ManifestStore, PostManifestEntry, PostStatus};

    #[tokio::test]
    async fn creates_and_persists_creator_manifest() {
        let directory = tempdir().unwrap();
        let store = ManifestStore::new(directory.path(), "creator").unwrap();
        let mut manifest = store.load().await.unwrap();
        manifest.posts.insert(
            "123".into(),
            PostManifestEntry {
                assets: Default::default(),
                directory: "posts/123".into(),
                error: None,
                id: "123".into(),
                restricted: false,
                status: PostStatus::Complete,
                updated_datetime: "2026-05-27T21:17:41+09:00".into(),
            },
        );
        store.save(&manifest).await.unwrap();
        assert!(!directory.path().join("creator/manifest.json.tmp").exists());
        assert_eq!(store.load().await.unwrap(), manifest);
    }
}
