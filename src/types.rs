use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct FanboxEnvelope<T> {
    pub body: T,
}

#[derive(Clone, Debug, Default, Deserialize, Serialize)]
pub struct FanboxClientOptions {
    #[serde(default)]
    pub base_url: Option<String>,
    #[serde(default)]
    pub cookie: Option<String>,
    #[serde(default)]
    pub user_agent: Option<String>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct FanboxUser {
    #[serde(rename = "iconUrl")]
    pub icon_url: String,
    pub name: String,
    #[serde(rename = "userId")]
    pub user_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct CreatorSummary {
    #[serde(rename = "creatorId")]
    pub creator_id: String,
    pub description: String,
    #[serde(rename = "hasAdultContent")]
    pub has_adult_content: bool,
    #[serde(rename = "iconUrl")]
    pub icon_url: String,
    #[serde(rename = "isFollowed")]
    pub is_followed: bool,
    #[serde(rename = "isSupported")]
    pub is_supported: bool,
    pub name: String,
    #[serde(rename = "userId")]
    pub user_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Creator {
    pub category: String,
    #[serde(rename = "coverImageUrl")]
    pub cover_image_url: Option<String>,
    #[serde(rename = "creatorId")]
    pub creator_id: String,
    pub description: String,
    #[serde(rename = "hasAdultContent")]
    pub has_adult_content: bool,
    #[serde(rename = "hasBoothShop")]
    pub has_booth_shop: bool,
    #[serde(rename = "hasPublishedPost")]
    pub has_published_post: bool,
    #[serde(rename = "isAcceptingRequest")]
    pub is_accepting_request: bool,
    #[serde(rename = "isFollowed")]
    pub is_followed: bool,
    #[serde(rename = "isStopped")]
    pub is_stopped: bool,
    #[serde(rename = "isSupported")]
    pub is_supported: bool,
    #[serde(rename = "profileItems")]
    pub profile_items: Vec<Value>,
    #[serde(rename = "profileLinks")]
    pub profile_links: Vec<String>,
    pub user: FanboxUser,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct Plan {
    #[serde(rename = "coverImageUrl")]
    pub cover_image_url: Option<String>,
    #[serde(rename = "creatorId")]
    pub creator_id: String,
    pub description: String,
    pub fee: u64,
    #[serde(rename = "hasAdultContent")]
    pub has_adult_content: bool,
    pub id: String,
    #[serde(rename = "paymentMethod")]
    pub payment_method: Option<String>,
    pub perks: Vec<String>,
    pub title: String,
    pub user: FanboxUser,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct SupportingPlan {
    #[serde(flatten)]
    pub plan: Plan,
    #[serde(rename = "paymentMethod")]
    pub payment_method: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PostCover {
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct NeighboringPost {
    pub id: String,
    #[serde(rename = "publishedDatetime")]
    pub published_datetime: String,
    pub title: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PostFile {
    pub extension: String,
    pub id: String,
    pub name: String,
    pub size: u64,
    pub url: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PostImage {
    pub extension: String,
    pub height: u64,
    pub id: String,
    #[serde(rename = "originalUrl")]
    pub original_url: String,
    #[serde(rename = "thumbnailUrl")]
    pub thumbnail_url: String,
    pub width: u64,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PostSummary {
    #[serde(rename = "commentCount")]
    pub comment_count: u64,
    pub cover: Option<PostCover>,
    #[serde(rename = "creatorId")]
    pub creator_id: String,
    pub excerpt: String,
    #[serde(rename = "feeRequired")]
    pub fee_required: u64,
    #[serde(rename = "hasAdultContent")]
    pub has_adult_content: bool,
    pub id: String,
    #[serde(rename = "isCommentingRestricted")]
    pub is_commenting_restricted: bool,
    #[serde(rename = "isLiked")]
    pub is_liked: bool,
    #[serde(rename = "isPinned")]
    pub is_pinned: bool,
    #[serde(rename = "isRestricted")]
    pub is_restricted: bool,
    #[serde(rename = "likeCount")]
    pub like_count: u64,
    #[serde(rename = "publishedDatetime")]
    pub published_datetime: String,
    pub tags: Vec<String>,
    pub title: String,
    #[serde(rename = "updatedDatetime")]
    pub updated_datetime: String,
    pub user: FanboxUser,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PostListParams {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "maxId")]
    pub max_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "maxPublishedDatetime")]
    pub max_published_datetime: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PostSort {
    Newest,
    Oldest,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ListCreatorPostsParams {
    #[serde(rename = "creatorId")]
    pub creator_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "firstId")]
    pub first_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "firstPublishedDatetime")]
    pub first_published_datetime: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub limit: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sort: Option<PostSort>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct PaginateCreatorPostsParams {
    #[serde(rename = "creatorId")]
    pub creator_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sort: Option<PostSort>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GetCreatorParams {
    #[serde(rename = "creatorId")]
    pub creator_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct GetPostParams {
    #[serde(rename = "postId")]
    pub post_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ListCreatorPlansParams {
    #[serde(rename = "creatorId")]
    pub creator_id: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct Post {
    #[serde(rename = "commentCount")]
    pub comment_count: u64,
    #[serde(rename = "coverImageUrl")]
    pub cover_image_url: Option<String>,
    #[serde(rename = "creatorId")]
    pub creator_id: String,
    pub excerpt: String,
    #[serde(rename = "feeRequired")]
    pub fee_required: u64,
    #[serde(rename = "hasAdultContent")]
    pub has_adult_content: bool,
    pub id: String,
    #[serde(rename = "imageForShare")]
    pub image_for_share: Option<String>,
    #[serde(rename = "isCommentingRestricted")]
    pub is_commenting_restricted: bool,
    #[serde(rename = "isLiked")]
    pub is_liked: bool,
    #[serde(rename = "isPinned")]
    pub is_pinned: bool,
    #[serde(rename = "isRestricted")]
    pub is_restricted: bool,
    #[serde(rename = "likeCount")]
    pub like_count: u64,
    #[serde(rename = "nextPost")]
    pub next_post: Option<NeighboringPost>,
    #[serde(rename = "prevPost")]
    pub prev_post: Option<NeighboringPost>,
    #[serde(rename = "publishedDatetime")]
    pub published_datetime: String,
    pub tags: Vec<String>,
    pub title: String,
    #[serde(rename = "type")]
    pub post_type: String,
    #[serde(rename = "updatedDatetime")]
    pub updated_datetime: String,
    pub user: FanboxUser,
    pub body: Value,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ImagePostBody {
    pub images: Vec<PostImage>,
    pub text: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct FilePostBody {
    pub files: Vec<PostFile>,
    pub text: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct VideoPostBody {
    pub text: String,
    pub video: VideoDetails,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct VideoDetails {
    #[serde(rename = "serviceProvider")]
    pub service_provider: String,
    #[serde(rename = "videoId")]
    pub video_id: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct TextPostBody {
    pub text: String,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct ArticlePostBody {
    pub blocks: Vec<ArticleBlock>,
    #[serde(rename = "fileMap")]
    pub file_map: std::collections::HashMap<String, PostFile>,
    #[serde(rename = "imageMap")]
    pub image_map: std::collections::HashMap<String, PostImage>,
    #[serde(rename = "urlEmbedMap")]
    pub url_embed_map: std::collections::HashMap<String, Value>,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
#[serde(tag = "type")]
pub enum ArticleBlock {
    #[serde(rename = "file")]
    File { #[serde(rename = "fileId")] file_id: String },
    #[serde(rename = "header")]
    Header { text: String },
    #[serde(rename = "image")]
    Image { #[serde(rename = "imageId")] image_id: String },
    #[serde(rename = "p")]
    Paragraph { text: String },
    #[serde(rename = "url_embed")]
    UrlEmbed { #[serde(rename = "urlEmbedId")] url_embed_id: String },
    #[serde(other)]
    Unknown,
}

impl Post {
    pub fn image_body(&self) -> Option<ImagePostBody> {
        serde_json::from_value(self.body.clone()).ok()
    }

    pub fn file_body(&self) -> Option<FilePostBody> {
        serde_json::from_value(self.body.clone()).ok()
    }

    pub fn article_body(&self) -> Option<ArticlePostBody> {
        serde_json::from_value(self.body.clone()).ok()
    }

    pub fn text_body(&self) -> Option<TextPostBody> {
        serde_json::from_value(self.body.clone()).ok()
    }

    pub fn video_body(&self) -> Option<VideoPostBody> {
        serde_json::from_value(self.body.clone()).ok()
    }
}
