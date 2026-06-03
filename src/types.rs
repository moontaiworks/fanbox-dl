use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct FanboxEnvelope<T> {
    pub body: T,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FanboxUser {
    pub icon_url: String,
    pub name: String,
    pub user_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreatorSummary {
    pub creator_id: String,
    pub description: String,
    pub has_adult_content: bool,
    pub icon_url: String,
    pub is_followed: bool,
    pub is_supported: bool,
    pub name: String,
    pub user_id: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Creator {
    pub category: String,
    pub cover_image_url: Option<String>,
    pub creator_id: String,
    pub description: String,
    pub has_adult_content: bool,
    pub has_booth_shop: bool,
    pub has_published_post: bool,
    pub is_accepting_request: bool,
    pub is_followed: bool,
    pub is_stopped: bool,
    pub is_supported: bool,
    #[serde(default)]
    pub profile_items: Vec<Value>,
    #[serde(default)]
    pub profile_links: Vec<String>,
    pub user: FanboxUser,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub cover_image_url: Option<String>,
    pub creator_id: String,
    pub description: String,
    pub fee: u64,
    pub has_adult_content: bool,
    pub id: String,
    pub payment_method: Option<String>,
    #[serde(default)]
    pub perks: Vec<String>,
    pub title: String,
    pub user: FanboxUser,
}

pub type SupportingPlan = Plan;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostCover {
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostSummary {
    pub comment_count: u64,
    pub cover: Option<PostCover>,
    pub creator_id: String,
    pub excerpt: String,
    pub fee_required: u64,
    pub has_adult_content: bool,
    pub id: String,
    pub is_commenting_restricted: bool,
    pub is_liked: bool,
    pub is_pinned: bool,
    pub is_restricted: bool,
    pub like_count: u64,
    pub published_datetime: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub title: String,
    pub updated_datetime: String,
    pub user: FanboxUser,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostImage {
    pub extension: String,
    pub height: u64,
    pub id: String,
    pub original_url: String,
    pub thumbnail_url: String,
    pub width: u64,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostFile {
    pub extension: String,
    pub id: String,
    pub name: String,
    pub size: u64,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Post {
    pub body: Option<Value>,
    pub comment_count: Option<u64>,
    pub cover_image_url: Option<String>,
    pub creator_id: String,
    pub excerpt: Option<String>,
    pub fee_required: Option<u64>,
    pub has_adult_content: Option<bool>,
    pub id: String,
    pub image_for_share: Option<String>,
    pub is_commenting_restricted: Option<bool>,
    pub is_liked: Option<bool>,
    pub is_pinned: Option<bool>,
    pub is_restricted: Option<bool>,
    pub like_count: Option<u64>,
    pub next_post: Option<Value>,
    pub prev_post: Option<Value>,
    pub published_datetime: String,
    #[serde(default)]
    pub tags: Vec<String>,
    pub title: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub updated_datetime: String,
    pub user: FanboxUser,
    #[serde(flatten)]
    pub extra: BTreeMap<String, Value>,
}

impl Post {
    pub fn body_value(&self) -> Option<&Value> {
        self.body.as_ref()
    }
}
