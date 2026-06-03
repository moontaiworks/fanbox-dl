use crate::logger::Logger;
use crate::scheduler::RequestScheduler;
use crate::types::{
    Creator, CreatorSummary, FanboxEnvelope, Plan, Post, PostSummary, SupportingPlan,
};
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, COOKIE, ORIGIN, USER_AGENT};
use serde::de::DeserializeOwned;
use serde::Serialize;
use serde_json::Value;
use std::sync::Arc;
use thiserror::Error;

const DEFAULT_BASE_URL: &str = "https://api.fanbox.cc";

#[derive(Clone)]
pub struct FanboxClient {
    base_url: String,
    cookie: Option<String>,
    http: reqwest::Client,
    logger: Logger,
    scheduler: Option<Arc<RequestScheduler>>,
    user_agent: String,
}

#[derive(Clone, Debug)]
pub struct FanboxClientOptions {
    pub base_url: String,
    pub cookie: Option<String>,
    pub logger: Logger,
    pub scheduler: Option<Arc<RequestScheduler>>,
    pub user_agent: Option<String>,
}

impl Default for FanboxClientOptions {
    fn default() -> Self {
        Self {
            base_url: DEFAULT_BASE_URL.to_string(),
            cookie: None,
            logger: Logger::default(),
            scheduler: None,
            user_agent: None,
        }
    }
}

#[derive(Debug, Error)]
#[error("FANBOX API request failed: {status} {status_text}")]
pub struct FanboxApiError {
    pub body: Value,
    pub status: u16,
    pub status_text: String,
}

#[derive(Debug, Error)]
pub enum FanboxClientError {
    #[error(transparent)]
    Api(#[from] FanboxApiError),
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error(transparent)]
    Json(#[from] serde_json::Error),
    #[error(transparent)]
    Scheduler(#[from] crate::scheduler::SchedulerError),
    #[error(transparent)]
    Url(#[from] url::ParseError),
}

impl FanboxClient {
    pub fn new(options: FanboxClientOptions) -> Self {
        Self {
            base_url: options.base_url,
            cookie: options.cookie,
            http: reqwest::Client::new(),
            logger: options.logger,
            scheduler: options.scheduler,
            user_agent: options
                .user_agent
                .unwrap_or_else(random_user_agent_fragment),
        }
    }

    pub async fn get_creator(&self, creator_id: &str) -> Result<Creator, FanboxClientError> {
        self.get("creator.get", &[("creatorId", creator_id)]).await
    }

    pub async fn get_post(&self, post_id: &str) -> Result<Post, FanboxClientError> {
        self.get("post.info", &[("postId", post_id)]).await
    }

    pub async fn list_creator_plans(
        &self,
        creator_id: &str,
    ) -> Result<Vec<Plan>, FanboxClientError> {
        self.get("plan.listCreator", &[("creatorId", creator_id)])
            .await
    }

    pub async fn list_creator_posts(
        &self,
        params: &ListCreatorPostsParams,
    ) -> Result<Vec<PostSummary>, FanboxClientError> {
        self.get("post.listCreator", params).await
    }

    pub async fn list_following_creators(&self) -> Result<Vec<CreatorSummary>, FanboxClientError> {
        self.get("creator.listFollowing", &[] as &[(&str, &str)])
            .await
    }

    pub async fn list_home_posts(
        &self,
        params: &PostListParams,
    ) -> Result<Vec<PostSummary>, FanboxClientError> {
        self.get("post.listHome", params).await
    }

    pub async fn list_supporting_plans(&self) -> Result<Vec<SupportingPlan>, FanboxClientError> {
        self.get("plan.listSupporting", &[] as &[(&str, &str)])
            .await
    }

    pub async fn list_supporting_posts(
        &self,
        params: &PostListParams,
    ) -> Result<Vec<PostSummary>, FanboxClientError> {
        self.get("post.listSupporting", params).await
    }

    pub async fn paginate_creator_posts(
        &self,
        creator_id: &str,
        sort: &str,
    ) -> Result<Vec<String>, FanboxClientError> {
        self.get(
            "post.paginateCreator",
            &[("creatorId", creator_id), ("sort", sort)],
        )
        .await
    }

    async fn get<T, Q>(&self, path: &str, query: &Q) -> Result<T, FanboxClientError>
    where
        T: DeserializeOwned,
        Q: Serialize + ?Sized,
    {
        let base = if self.base_url.ends_with('/') {
            self.base_url.clone()
        } else {
            format!("{}/", self.base_url)
        };
        let mut url = url::Url::parse(&base)?.join(path)?;
        {
            let mut pairs = url.query_pairs_mut();
            let value = serde_json::to_value(query).unwrap_or(Value::Null);
            match value {
                Value::Array(items) => {
                    for item in items {
                        if let Value::Array(pair) = item {
                            if pair.len() == 2 {
                                pairs.append_pair(
                                    pair[0].as_str().unwrap_or_default(),
                                    pair[1].as_str().unwrap_or_default(),
                                );
                            }
                        }
                    }
                }
                Value::Object(map) => {
                    for (key, value) in map {
                        if !value.is_null() {
                            let value = match value {
                                Value::String(value) => value,
                                other => other.to_string(),
                            };
                            pairs.append_pair(&key, &value);
                        }
                    }
                }
                _ => {}
            }
        }

        let headers = self.headers();
        let response = if let Some(scheduler) = &self.scheduler {
            scheduler
                .send(|| self.http.get(url.clone()).headers(headers.clone()))
                .await?
        } else {
            self.http.get(url).headers(headers).send().await?
        };
        let status = response.status();
        let status_text = status.canonical_reason().unwrap_or("").to_string();
        let bytes = response.bytes().await?;
        let body: Value = serde_json::from_slice(&bytes)
            .unwrap_or_else(|_| Value::String(String::from_utf8_lossy(&bytes).into_owned()));
        if !status.is_success() {
            return Err(FanboxApiError {
                body,
                status: status.as_u16(),
                status_text,
            }
            .into());
        }

        let envelope: FanboxEnvelope<T> = serde_json::from_value(body)?;
        self.logger.info(
            "api.request.complete",
            "API request completed",
            serde_json::json!({
                "path": path,
                "status": status.as_u16(),
                "statusText": status_text,
            }),
        );
        Ok(envelope.body)
    }

    fn headers(&self) -> HeaderMap {
        let mut headers = HeaderMap::new();
        headers.insert(
            ACCEPT,
            HeaderValue::from_static("application/json, text/plain, */*"),
        );
        headers.insert(ORIGIN, HeaderValue::from_static("https://www.fanbox.cc"));
        headers.insert(USER_AGENT, HeaderValue::from_str(&self.user_agent).unwrap());
        if let Some(cookie) = &self.cookie {
            if let Ok(value) = HeaderValue::from_str(cookie) {
                headers.insert(COOKIE, value);
            }
        }
        headers
    }
}

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PostListParams {
    pub limit: Option<u32>,
    pub max_id: Option<String>,
    pub max_published_datetime: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCreatorPostsParams {
    pub creator_id: String,
    pub first_id: Option<String>,
    pub first_published_datetime: Option<String>,
    pub limit: Option<u32>,
    pub sort: Option<String>,
}

fn random_user_agent_fragment() -> String {
    let now = chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default();
    format!(
        "{:x}/0.{:05}",
        now.unsigned_abs(),
        now.unsigned_abs() % 100000
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::logger::{LogFormat, LogLevel, Logger};
    use std::sync::{Arc, Mutex};
    use wiremock::matchers::{header, method, path, query_param};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn sends_browser_headers_and_unwraps_body() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/creator.get"))
            .and(query_param("creatorId", "creator"))
            .and(header("Origin", "https://www.fanbox.cc"))
            .and(header("User-Agent", "ua"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "body": {
                    "category": "",
                    "coverImageUrl": null,
                    "creatorId": "creator",
                    "description": "",
                    "hasAdultContent": false,
                    "hasBoothShop": false,
                    "hasPublishedPost": true,
                    "isAcceptingRequest": false,
                    "isFollowed": true,
                    "isStopped": false,
                    "isSupported": false,
                    "profileItems": [],
                    "profileLinks": [],
                    "user": { "iconUrl": "", "name": "Creator", "userId": "1" }
                }
            })))
            .mount(&server)
            .await;

        let client = FanboxClient::new(FanboxClientOptions {
            base_url: server.uri(),
            user_agent: Some("ua".to_string()),
            ..Default::default()
        });

        let creator = client.get_creator("creator").await.unwrap();
        assert_eq!(creator.creator_id, "creator");
    }

    #[tokio::test]
    async fn logs_successful_api_requests_at_info_level() {
        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .and(path("/creator.get"))
            .and(query_param("creatorId", "creator"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "body": {
                    "category": "",
                    "coverImageUrl": null,
                    "creatorId": "creator",
                    "description": "",
                    "hasAdultContent": false,
                    "hasBoothShop": false,
                    "hasPublishedPost": true,
                    "isAcceptingRequest": false,
                    "isFollowed": true,
                    "isStopped": false,
                    "isSupported": false,
                    "profileItems": [],
                    "profileLinks": [],
                    "user": { "iconUrl": "", "name": "Creator", "userId": "1" }
                }
            })))
            .mount(&server)
            .await;
        let lines = Arc::new(Mutex::new(Vec::new()));
        let sink = lines.clone();
        let logger = Logger::with_sink(
            LogFormat::Json,
            LogLevel::Info,
            Arc::new(move |line| sink.lock().unwrap().push(line.to_string())),
        );
        let client = FanboxClient::new(FanboxClientOptions {
            base_url: server.uri(),
            logger,
            user_agent: Some("ua".to_string()),
            ..Default::default()
        });

        client.get_creator("creator").await.unwrap();

        let lines = lines.lock().unwrap();
        let log: Value = serde_json::from_str(&lines[0]).unwrap();
        assert_eq!(log["level"], "info");
        assert_eq!(log["event"], "api.request.complete");
        assert_eq!(log["path"], "creator.get");
        assert_eq!(log["status"], 200);
    }
}
