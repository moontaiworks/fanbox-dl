use std::fmt::{Display, Formatter};
use std::sync::Arc;

use anyhow::{Context, Result, anyhow};
use serde::Serialize;
use serde::de::DeserializeOwned;
use serde_json::Value;
use url::Url;

use crate::downloader::scheduler::RequestScheduler;
use crate::http::{HttpClient, HttpRequest};
use crate::types::{
    Creator, CreatorSummary, FanboxEnvelope, GetCreatorParams, GetPostParams, ListCreatorPlansParams,
    ListCreatorPostsParams, PaginateCreatorPostsParams, Plan, Post, PostListParams, PostSummary,
    SupportingPlan,
};

const DEFAULT_BASE_URL: &str = "https://api.fanbox.cc";

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FanboxApiError {
    pub body: Value,
    pub status: u16,
    pub status_text: String,
}

impl Display for FanboxApiError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        write!(f, "FANBOX API request failed: {} {}", self.status, self.status_text)
    }
}

impl std::error::Error for FanboxApiError {}

#[derive(Clone)]
pub struct FanboxClient {
    base_url: Url,
    cookie: Option<String>,
    http: Arc<dyn HttpClient>,
    scheduler: RequestScheduler,
    user_agent: Option<String>,
}

impl FanboxClient {
    pub fn new(
        base_url: Option<String>,
        cookie: Option<String>,
        http: Arc<dyn HttpClient>,
        scheduler: RequestScheduler,
        user_agent: Option<String>,
    ) -> Result<Self> {
        let base_url = Url::parse(base_url.as_deref().unwrap_or(DEFAULT_BASE_URL))
            .context("invalid FANBOX base URL")?;
        Ok(Self {
            base_url,
            cookie,
            http,
            scheduler,
            user_agent,
        })
    }

    pub async fn get_creator(&self, params: GetCreatorParams) -> Result<Creator> {
        self.get("creator.get", &params).await
    }

    pub async fn get_post(&self, params: GetPostParams) -> Result<Post> {
        self.get("post.info", &params).await
    }

    pub async fn list_creator_plans(&self, params: ListCreatorPlansParams) -> Result<Vec<Plan>> {
        self.get("plan.listCreator", &params).await
    }

    pub async fn list_creator_posts(&self, params: ListCreatorPostsParams) -> Result<Vec<PostSummary>> {
        self.get("post.listCreator", &params).await
    }

    pub async fn list_following_creators(&self) -> Result<Vec<CreatorSummary>> {
        self.get::<(), _>("creator.listFollowing", &()).await
    }

    pub async fn list_home_posts(&self, params: PostListParams) -> Result<Vec<PostSummary>> {
        self.get("post.listHome", &params).await
    }

    pub async fn list_supporting_plans(&self) -> Result<Vec<SupportingPlan>> {
        self.get::<(), _>("plan.listSupporting", &()).await
    }

    pub async fn list_supporting_posts(&self, params: PostListParams) -> Result<Vec<PostSummary>> {
        self.get("post.listSupporting", &params).await
    }

    pub async fn paginate_creator_posts(&self, params: PaginateCreatorPostsParams) -> Result<Vec<String>> {
        self.get("post.paginateCreator", &params).await
    }

    async fn get<Q, T>(&self, path: &str, query: &Q) -> Result<T>
    where
        Q: Serialize + ?Sized,
        T: DeserializeOwned,
    {
        let url = self.base_url.join(path).context("failed to join FANBOX path")?;
        let mut request = HttpRequest::get(url).with_query(query);
        request = request
            .header("accept", "application/json, text/plain, */*")
            .header("origin", "https://www.fanbox.cc")
            .header("referer", "https://www.fanbox.cc/")
            .header("sec-fetch-dest", "empty")
            .header("sec-fetch-mode", "cors")
            .header("sec-fetch-site", "same-site");
        if let Some(cookie) = &self.cookie {
            request = request.header("cookie", cookie);
        }
        if let Some(user_agent) = &self.user_agent {
            request = request.header("user-agent", user_agent);
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
            return Err(anyhow!(FanboxApiError {
                body: response.json_or_text(),
                status: response.status,
                status_text: response.status_text,
            }));
        }
        let envelope: FanboxEnvelope<T> = response.json()?;
        Ok(envelope.body)
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use anyhow::Result;
    use serde_json::json;

    use crate::downloader::scheduler::RequestScheduler;
    use crate::http::{RecordingHttpClient, HttpResponse};
    use crate::types::{GetCreatorParams, GetPostParams, ListCreatorPostsParams, PaginateCreatorPostsParams, PostSort, PostListParams};

    use super::{FanboxApiError, FanboxClient};

    fn client_with_body(body: serde_json::Value) -> (FanboxClient, RecordingHttpClient) {
        let http = RecordingHttpClient::new(vec![Ok(HttpResponse {
            body: serde_json::to_vec(&json!({ "body": body })).unwrap(),
            headers: Default::default(),
            status: 200,
            status_text: "OK".to_string(),
        })]);
        let client = FanboxClient::new(
            None,
            Some("FANBOXSESSID=session-id".to_string()),
            Arc::new(http.clone()),
            RequestScheduler::new(1),
            None,
        )
        .unwrap();
        (client, http)
    }

    fn request_url(http: &RecordingHttpClient) -> String {
        http.requests.lock().unwrap()[0].url.to_string()
    }

    #[tokio::test]
    async fn gets_creator_with_fanbox_headers() -> Result<()> {
        let (client, http) = client_with_body(json!({ "creatorId": "alfabravo11", "category": "", "coverImageUrl": null, "description": "", "hasAdultContent": false, "hasBoothShop": false, "hasPublishedPost": false, "isAcceptingRequest": false, "isFollowed": false, "isStopped": false, "isSupported": false, "profileItems": [], "profileLinks": [], "user": { "iconUrl": "", "name": "", "userId": "1" } }));
        let _ = client
            .get_creator(GetCreatorParams {
                creator_id: "alfabravo11".into(),
            })
            .await?;
        let requests = http.requests.lock().unwrap();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].url.as_str(), "https://api.fanbox.cc/creator.get?creatorId=alfabravo11");
        assert_eq!(requests[0].headers.get("accept").unwrap(), "application/json, text/plain, */*");
        assert_eq!(requests[0].headers.get("cookie").unwrap(), "FANBOXSESSID=session-id");
        Ok(())
    }

    #[tokio::test]
    async fn serializes_parameters() -> Result<()> {
        let http = RecordingHttpClient::new(vec![Ok(HttpResponse {
            body: serde_json::to_vec(&json!({ "body": [] })).unwrap(),
            headers: Default::default(),
            status: 200,
            status_text: "OK".into(),
        })]);
        let client = FanboxClient::new(
            Some("https://example.test/api/".into()),
            None,
            Arc::new(http.clone()),
            RequestScheduler::new(1),
            Some("Mozilla/5.0 test".into()),
        )?;
        let _ = client
            .list_creator_posts(ListCreatorPostsParams {
                creator_id: "creator".into(),
                first_id: Some("123".into()),
                first_published_datetime: Some("2026-05-27 21:17:41".into()),
                limit: Some(30),
                sort: Some(PostSort::Newest),
            })
            .await?;
        assert_eq!(request_url(&http), "https://example.test/api/post.listCreator?creatorId=creator&firstId=123&firstPublishedDatetime=2026-05-27+21%3A17%3A41&limit=30&sort=newest");
        assert_eq!(http.requests.lock().unwrap()[0].headers.get("user-agent").unwrap(), "Mozilla/5.0 test");
        Ok(())
    }

    #[tokio::test]
    async fn omits_unset_pagination_values() -> Result<()> {
        let http = RecordingHttpClient::new(vec![Ok(HttpResponse {
            body: serde_json::to_vec(&json!({ "body": [] })).unwrap(),
            headers: Default::default(),
            status: 200,
            status_text: "OK".into(),
        })]);
        let client = FanboxClient::new(None, None, Arc::new(http.clone()), RequestScheduler::new(1), None)?;
        let _ = client.list_home_posts(PostListParams { limit: Some(20), max_id: None, max_published_datetime: None }).await?;
        assert_eq!(request_url(&http), "https://api.fanbox.cc/post.listHome?limit=20");
        Ok(())
    }

    #[tokio::test]
    async fn lists_supporting_posts_with_cursor() -> Result<()> {
        let http = RecordingHttpClient::new(vec![Ok(HttpResponse {
            body: serde_json::to_vec(&json!({ "body": [] })).unwrap(),
            headers: Default::default(),
            status: 200,
            status_text: "OK".into(),
        })]);
        let client = FanboxClient::new(None, None, Arc::new(http.clone()), RequestScheduler::new(1), None)?;
        let _ = client
            .list_supporting_posts(PostListParams {
                limit: Some(10),
                max_id: Some("11975272".into()),
                max_published_datetime: Some("2026-05-27 21:17:41".into()),
            })
            .await?;
        assert_eq!(request_url(&http), "https://api.fanbox.cc/post.listSupporting?limit=10&maxId=11975272&maxPublishedDatetime=2026-05-27+21%3A17%3A41");
        Ok(())
    }

    #[tokio::test]
    async fn throws_structured_error() {
        let http = RecordingHttpClient::new(vec![Ok(HttpResponse {
            body: serde_json::to_vec(&json!({ "error": "Unauthorized" })).unwrap(),
            headers: Default::default(),
            status: 401,
            status_text: "Unauthorized".into(),
        })]);
        let client = FanboxClient::new(None, None, Arc::new(http), RequestScheduler::new(1), None).unwrap();
        let error = client
            .get_creator(GetCreatorParams { creator_id: "creator".into() })
            .await
            .unwrap_err();
        let fanbox = error.downcast_ref::<FanboxApiError>().unwrap();
        assert_eq!(fanbox.status, 401);
        assert_eq!(fanbox.body, json!({ "error": "Unauthorized" }));
    }

    #[tokio::test]
    async fn preserves_non_json_error_body() {
        let http = RecordingHttpClient::new(vec![Ok(HttpResponse {
            body: b"Bad Gateway".to_vec(),
            headers: Default::default(),
            status: 502,
            status_text: "Bad Gateway".into(),
        })]);
        let client = FanboxClient::new(None, None, Arc::new(http), RequestScheduler::new(1), None).unwrap();
        let error = client
            .get_post(GetPostParams { post_id: "11975272".into() })
            .await
            .unwrap_err();
        let fanbox = error.downcast_ref::<FanboxApiError>().unwrap();
        assert_eq!(fanbox.body, json!("Bad Gateway"));
    }

    #[tokio::test]
    async fn paginates_creator_posts() -> Result<()> {
        let http = RecordingHttpClient::new(vec![Ok(HttpResponse {
            body: serde_json::to_vec(&json!({ "body": [] })).unwrap(),
            headers: Default::default(),
            status: 200,
            status_text: "OK".into(),
        })]);
        let client = FanboxClient::new(None, None, Arc::new(http.clone()), RequestScheduler::new(1), None)?;
        let _ = client.paginate_creator_posts(PaginateCreatorPostsParams { creator_id: "creator".into(), sort: Some(PostSort::Oldest) }).await?;
        assert_eq!(request_url(&http), "https://api.fanbox.cc/post.paginateCreator?creatorId=creator&sort=oldest");
        Ok(())
    }
}
