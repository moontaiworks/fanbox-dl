use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;

use anyhow::Result;
use serde_json::json;
use tokio::sync::{Mutex, Semaphore};

use crate::http::HttpResponse;

use super::errors::log_debug_response;
use super::logger::{LogFields, Logger};

type BoxFuture<T> = Pin<Box<dyn Future<Output = T> + Send>>;
type NowFn = Arc<dyn Fn() -> u64 + Send + Sync>;
type SleepFn = Arc<dyn Fn(u64) -> BoxFuture<()> + Send + Sync>;

#[derive(Clone)]
pub struct RequestScheduler {
    logger: Logger,
    max_retries: usize,
    now: NowFn,
    rate_limit_pause_ms: u64,
    request_interval_ms: u64,
    semaphore: Arc<Semaphore>,
    sleep: SleepFn,
    state: Arc<Mutex<SchedulerState>>,
}

#[derive(Default)]
struct SchedulerState {
    next_start_at: u64,
    paused_until: u64,
}

impl RequestScheduler {
    #[must_use]
    pub fn new(concurrency: usize) -> Self {
        Self::with_hooks(
            concurrency,
            Logger::silent(),
            5,
            Arc::new(|| chrono::Utc::now().timestamp_millis() as u64),
            60_000,
            0,
            Arc::new(|milliseconds| Box::pin(tokio::time::sleep(std::time::Duration::from_millis(milliseconds)))),
        )
    }

    #[must_use]
    pub fn with_hooks(
        concurrency: usize,
        logger: Logger,
        max_retries: usize,
        now: NowFn,
        rate_limit_pause_ms: u64,
        request_interval_ms: u64,
        sleep: SleepFn,
    ) -> Self {
        assert!(concurrency > 0, "concurrency must be a positive integer");
        Self {
            logger,
            max_retries,
            now,
            rate_limit_pause_ms,
            request_interval_ms,
            semaphore: Arc::new(Semaphore::new(concurrency)),
            sleep,
            state: Arc::new(Mutex::new(SchedulerState::default())),
        }
    }

    pub fn pause(&self, milliseconds: u64) {
        let now = (self.now)();
        let state = Arc::clone(&self.state);
        tokio::spawn(async move {
            let mut state = state.lock().await;
            state.paused_until = state.paused_until.max(now + milliseconds);
        });
    }

    pub async fn run<T, F, Fut>(&self, operation: F) -> T
    where
        F: FnOnce() -> Fut,
        Fut: Future<Output = T>,
    {
        let _permit = self.semaphore.acquire().await.expect("semaphore should remain open");
        self.wait_to_start().await;
        operation().await
    }

    pub async fn fetch<F, Fut>(&self, operation: F) -> Result<HttpResponse>
    where
        F: Fn() -> Fut,
        Fut: Future<Output = Result<HttpResponse>>,
    {
        let mut attempt = 0;
        loop {
            match self.run(|| operation()).await {
                Ok(response) if !is_retryable_status(response.status) || attempt >= self.max_retries => return Ok(response),
                Ok(response) => {
                    log_debug_response(&self.logger, &response, LogFields::from_iter([(String::from("attempt"), json!(attempt + 1))]));
                    if response.status == 429 {
                        let pause_ms = parse_retry_after(&response, (self.now)()).unwrap_or(self.rate_limit_pause_ms);
                        {
                            let mut state = self.state.lock().await;
                            state.paused_until = state.paused_until.max((self.now)() + pause_ms);
                        }
                        self.logger.warn("request.rate-limit.pause", "Rate limit reached; pausing requests", LogFields::from_iter([(String::from("pauseMs"), json!(pause_ms))]));
                    }
                }
                Err(error) if attempt >= self.max_retries => return Err(error),
                Err(_) => {}
            }
            attempt += 1;
            self.logger.warn("request.retry", "Retrying request", LogFields::from_iter([(String::from("attempt"), json!(attempt))]));
        }
    }

    async fn wait_to_start(&self) {
        loop {
            let now = (self.now)();
            let delay = {
                let mut state = self.state.lock().await;
                let delay = state.paused_until.max(state.next_start_at).saturating_sub(now);
                if delay == 0 {
                    state.next_start_at = now + self.request_interval_ms;
                }
                delay
            };
            if delay == 0 {
                return;
            }
            (self.sleep)(delay).await;
        }
    }
}

fn is_retryable_status(status: u16) -> bool {
    status == 408 || status == 429 || status >= 500
}

fn parse_retry_after(response: &HttpResponse, now: u64) -> Option<u64> {
    let retry_after = response.headers.get("Retry-After")?.to_str().ok()?;
    if let Ok(seconds) = retry_after.parse::<u64>() {
        return Some(seconds * 1_000);
    }
    let date = chrono::DateTime::parse_from_rfc2822(retry_after).ok()?;
    Some(date.timestamp_millis().max(now as i64) as u64 - now)
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Mutex};

    use anyhow::Result;
    use reqwest::header::HeaderMap;

    use super::*;
    use crate::downloader::logger::{LogFormat, LogLevel};

    fn response(status: u16, body: &str) -> HttpResponse {
        HttpResponse {
            body: body.as_bytes().to_vec(),
            headers: HeaderMap::new(),
            status,
            status_text: String::new(),
        }
    }

    #[tokio::test]
    async fn limits_concurrent_operations() {
        let scheduler = RequestScheduler::new(2);
        let active = Arc::new(Mutex::new(0usize));
        let maximum = Arc::new(Mutex::new(0usize));
        let operations = (0..4).map(|_| {
            let scheduler = scheduler.clone();
            let active = Arc::clone(&active);
            let maximum = Arc::clone(&maximum);
            tokio::spawn(async move {
                scheduler.run(|| async move {
                    {
                        let mut active = active.lock().unwrap();
                        *active += 1;
                        let mut maximum = maximum.lock().unwrap();
                        *maximum = (*maximum).max(*active);
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(5)).await;
                    *active.lock().unwrap() -= 1;
                }).await;
            })
        });
        futures::future::join_all(operations).await;
        assert_eq!(*maximum.lock().unwrap(), 2);
    }

    #[tokio::test]
    async fn retries_rate_limited_responses_after_pause() -> Result<()> {
        let sleeps = Arc::new(Mutex::new(Vec::new()));
        let events = Arc::new(Mutex::new(Vec::new()));
        let now = Arc::new(Mutex::new(0u64));
        let logger = Logger::new(LogFormat::Json, LogLevel::Debug, Arc::new({
            let events = Arc::clone(&events);
            move |line| {
                let value: serde_json::Value = serde_json::from_str(&line).unwrap();
                events.lock().unwrap().push(value["event"].as_str().unwrap().to_string());
            }
        }));
        let scheduler = RequestScheduler::with_hooks(
            1,
            logger,
            5,
            Arc::new({ let now = Arc::clone(&now); move || *now.lock().unwrap() }),
            60_000,
            0,
            Arc::new({
                let sleeps = Arc::clone(&sleeps);
                let now = Arc::clone(&now);
                move |milliseconds| {
                    let sleeps = Arc::clone(&sleeps);
                    let now = Arc::clone(&now);
                    Box::pin(async move {
                        sleeps.lock().unwrap().push(milliseconds);
                        *now.lock().unwrap() += milliseconds;
                    })
                }
            }),
        );
        let attempts = Arc::new(Mutex::new(0));
        let response = scheduler.fetch({
            let attempts = Arc::clone(&attempts);
            move || {
                let attempts = Arc::clone(&attempts);
                async move {
                    let mut attempts = attempts.lock().unwrap();
                    *attempts += 1;
                    if *attempts == 1 {
                        let mut response = response(429, "");
                        response.headers.insert("Retry-After", "2".parse().unwrap());
                        Ok(response)
                    } else {
                        Ok(response(200, "ok"))
                    }
                }
            }
        }).await?;
        assert_eq!(response.text(), "ok");
        assert_eq!(*attempts.lock().unwrap(), 2);
        assert!(sleeps.lock().unwrap().contains(&2_000));
        assert_eq!(&*events.lock().unwrap(), &["api.response.error", "request.rate-limit.pause", "request.retry"]);
        Ok(())
    }

    #[tokio::test]
    async fn does_not_retry_non_rate_limited_client_error() -> Result<()> {
        let scheduler = RequestScheduler::new(1);
        let attempts = Arc::new(Mutex::new(0));
        let response = scheduler.fetch({
            let attempts = Arc::clone(&attempts);
            move || {
                let attempts = Arc::clone(&attempts);
                async move {
                    *attempts.lock().unwrap() += 1;
                    Ok(response(404, ""))
                }
            }
        }).await?;
        assert_eq!(response.status, 404);
        assert_eq!(*attempts.lock().unwrap(), 1);
        Ok(())
    }

    #[tokio::test]
    async fn debug_logs_retryable_response_bodies() -> Result<()> {
        let entries = Arc::new(Mutex::new(Vec::new()));
        let logger = Logger::new(LogFormat::Json, LogLevel::Debug, Arc::new({
            let entries = Arc::clone(&entries);
            move |line| entries.lock().unwrap().push(line)
        }));
        let scheduler = RequestScheduler::with_hooks(
            1,
            logger,
            1,
            Arc::new(|| 0),
            60_000,
            0,
            Arc::new(|_| Box::pin(async {})),
        );
        let attempts = Arc::new(Mutex::new(0));
        let response = scheduler.fetch({
            let attempts = Arc::clone(&attempts);
            move || {
                let attempts = Arc::clone(&attempts);
                async move {
                    *attempts.lock().unwrap() += 1;
                    if *attempts.lock().unwrap() == 1 {
                        Ok(HttpResponse { body: br#"{"error":"try again"}"#.to_vec(), headers: HeaderMap::new(), status: 500, status_text: String::new() })
                    } else {
                        Ok(response(200, "ok"))
                    }
                }
            }
        }).await?;
        assert_eq!(response.text(), "ok");
        assert!(entries.lock().unwrap().iter().any(|line| line.contains("try again")));
        Ok(())
    }
}
