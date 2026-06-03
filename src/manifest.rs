use crate::path::create_creator_directory_name;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use thiserror::Error;
use tokio::fs;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatorManifest {
    pub creator_id: String,
    pub posts: BTreeMap<String, PostManifestEntry>,
    pub schema_version: u8,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostManifestEntry {
    pub assets: BTreeMap<String, AssetManifestEntry>,
    pub directory: String,
    pub id: String,
    pub restricted: bool,
    pub status: PostStatus,
    pub updated_datetime: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetManifestEntry {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    pub status: AssetStatus,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PostStatus {
    Complete,
    Failed,
    Pending,
    Skipped,
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

#[derive(Debug, Error)]
pub enum ManifestError {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Path(#[from] crate::path::PathError),
}

#[derive(Clone, Debug)]
pub struct ManifestStore {
    creator_directory: PathBuf,
    manifest_path: PathBuf,
}

impl ManifestStore {
    pub fn new(output: &Path, creator_id: &str) -> Result<Self, ManifestError> {
        let creator_directory = output.join(create_creator_directory_name(creator_id, output)?);
        let manifest_path = creator_directory.join("manifest.json");
        Ok(Self {
            creator_directory,
            manifest_path,
        })
    }

    pub fn creator_directory(&self) -> &Path {
        &self.creator_directory
    }

    pub async fn load(&self, creator_id: &str) -> Result<CreatorManifest, ManifestError> {
        match fs::read_to_string(&self.manifest_path).await {
            Ok(content) => Ok(serde_json::from_str(&content)?),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(CreatorManifest {
                creator_id: creator_id.to_string(),
                posts: BTreeMap::new(),
                schema_version: 1,
            }),
            Err(error) => Err(error.into()),
        }
    }

    pub async fn save(&self, manifest: &CreatorManifest) -> Result<(), ManifestError> {
        fs::create_dir_all(&self.creator_directory).await?;
        let temporary = self.manifest_path.with_extension("json.tmp");
        fs::write(
            &temporary,
            format!("{}\n", serde_json::to_string_pretty(manifest)?),
        )
        .await?;
        fs::rename(temporary, &self.manifest_path).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn loads_default_manifest_when_missing() {
        let temp = tempfile::tempdir().unwrap();
        let store = ManifestStore::new(temp.path(), "creator").unwrap();
        let manifest = store.load("creator").await.unwrap();
        assert_eq!(manifest.creator_id, "creator");
        assert_eq!(manifest.schema_version, 1);
    }
}
