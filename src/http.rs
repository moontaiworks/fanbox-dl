use std::collections::VecDeque;
use std::sync::{Arc, Mutex};

use anyhow::{Context, Result};
use async_trait::async_trait;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use serde::Serialize;
use serde_json::Value;
use url::Url;

#[derive(Clone, Debug)]
pub struct HttpRequest {
    pub headers: HeaderMap,
    pub method: String,
    pub url: Url,
}

impl HttpRequest {
    #[must_use]
    pub fn get(url: Url) -> Self {
        Self {
            headers: HeaderMap::new(),
            method: "GET".to_string(),
            url,
        }
    }

    #[must_use]
    pub fn header(mut self, name: &'static str, value: impl AsRef<str>) -> Self {
        self.headers.insert(
            HeaderName::from_static(name),
            HeaderValue::from_str(value.as_ref()).expect("valid header value"),
        );
        self
    }

    #[must_use]
    pub fn with_query<T: Serialize + ?Sized>(mut self, query: &T) -> Self {
        let query = serde_urlencoded::to_string(query).expect("serializable query");
        if !query.is_empty() {
            self.url.set_query(Some(&query));
        }
        self
    }
}

#[derive(Clone, Debug)]
pub struct HttpResponse {
    pub body: Vec<u8>,
    pub headers: HeaderMap,
    pub status: u16,
    pub status_text: String,
}

impl HttpResponse {
    #[must_use]
    pub fn is_success(&self) -> bool {
        (200..300).contains(&self.status)
    }

    pub fn json<T: serde::de::DeserializeOwned>(&self) -> Result<T> {
        serde_json::from_slice(&self.body).context("response body was not valid JSON")
    }

    #[must_use]
    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.body).into_owned()
    }

    #[must_use]
    pub fn json_or_text(&self) -> Value {
        serde_json::from_slice(&self.body).unwrap_or_else(|_| Value::String(self.text()))
    }
}

#[async_trait]
pub trait HttpClient: Send + Sync {
    async fn execute(&self, request: HttpRequest) -> Result<HttpResponse>;
}

#[derive(Clone, Default)]
pub struct ReqwestHttpClient {
    client: reqwest::Client,
}

impl ReqwestHttpClient {
    #[must_use]
    pub fn new() -> Self {
        Self {
            client: reqwest::Client::builder()
                .build()
                .expect("reqwest client should build"),
        }
    }
}

#[async_trait]
impl HttpClient for ReqwestHttpClient {
    async fn execute(&self, request: HttpRequest) -> Result<HttpResponse> {
        let mut builder = self.client.get(request.url);
        builder = builder.headers(request.headers);
        let response = builder.send().await.context("request failed")?;
        let status = response.status();
        let status_text = status.canonical_reason().unwrap_or_default().to_string();
        let headers = response.headers().clone();
        let body = response
            .bytes()
            .await
            .context("failed to read response body")?;
        Ok(HttpResponse {
            body: body.to_vec(),
            headers,
            status: status.as_u16(),
            status_text,
        })
    }
}

#[derive(Clone, Default)]
pub struct RecordingHttpClient {
    pub requests: Arc<Mutex<Vec<HttpRequest>>>,
    responses: Arc<Mutex<VecDeque<anyhow::Result<HttpResponse>>>>,
}

impl RecordingHttpClient {
    #[must_use]
    pub fn new(responses: Vec<anyhow::Result<HttpResponse>>) -> Self {
        Self {
            requests: Arc::new(Mutex::new(Vec::new())),
            responses: Arc::new(Mutex::new(VecDeque::from(responses))),
        }
    }

    #[must_use]
    pub fn response(status: u16, body: impl Into<Vec<u8>>) -> HttpResponse {
        HttpResponse {
            body: body.into(),
            headers: HeaderMap::new(),
            status,
            status_text: match status {
                200 => "OK",
                206 => "Partial Content",
                401 => "Unauthorized",
                403 => "Forbidden",
                404 => "Not Found",
                429 => "Too Many Requests",
                500 => "Internal Server Error",
                502 => "Bad Gateway",
                _ => "",
            }
            .to_string(),
        }
    }
}

#[async_trait]
impl HttpClient for RecordingHttpClient {
    async fn execute(&self, request: HttpRequest) -> Result<HttpResponse> {
        self.requests.lock().expect("lock").push(request);
        self.responses
            .lock()
            .expect("lock")
            .pop_front()
            .expect("test response should exist")
    }
}
