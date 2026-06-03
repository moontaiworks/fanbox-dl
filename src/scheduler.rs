use crate::logger::Logger;
use reqwest::{RequestBuilder, Response, StatusCode};
use std::sync::Arc;
use thiserror::Error;
use tokio::sync::{Mutex, Semaphore};
use tokio::time::{sleep, Duration, Instant};

#[derive(Debug, Error)]
pub enum SchedulerError {
    #[error(transparent)]
    Http(#[from] reqwest::Error),
    #[error("request semaphore closed")]
    Closed,
}

#[derive(Debug)]
struct Timing {
    next_start: Instant,
    paused_until: Instant,
}

#[derive(Debug)]
pub struct RequestScheduler {
    logger: Logger,
    max_retries: usize,
    rate_limit_pause: Duration,
    request_interval: Duration,
    semaphore: Semaphore,
    timing: Mutex<Timing>,
}

impl RequestScheduler {
    pub fn new(
        concurrency: usize,
        max_retries: usize,
        request_interval_ms: u64,
        rate_limit_pause_ms: u64,
        logger: Logger,
    ) -> Self {
        let now = Instant::now();
        Self {
            logger,
            max_retries,
            rate_limit_pause: Duration::from_millis(rate_limit_pause_ms),
            request_interval: Duration::from_millis(request_interval_ms),
            semaphore: Semaphore::new(concurrency.max(1)),
            timing: Mutex::new(Timing {
                next_start: now,
                paused_until: now,
            }),
        }
    }

    pub async fn send<F>(&self, build: F) -> Result<Response, SchedulerError>
    where
        F: Fn() -> RequestBuilder,
    {
        let mut attempt = 0;
        loop {
            let response = self.run_request(build()).await;
            match response {
                Ok(response)
                    if !is_retryable_status(response.status()) || attempt >= self.max_retries =>
                {
                    return Ok(response);
                }
                Ok(response) => {
                    if response.status() == StatusCode::TOO_MANY_REQUESTS {
                        let pause = retry_after(&response).unwrap_or(self.rate_limit_pause);
                        self.pause(pause).await;
                        self.logger.warn(
                            "request.rate-limit.pause",
                            "Rate limit reached; pausing requests",
                            serde_json::json!({ "pauseMs": pause.as_millis() }),
                        );
                    }
                }
                Err(error) if attempt >= self.max_retries => return Err(error),
                Err(_) => {}
            }
            attempt += 1;
            self.logger.warn(
                "request.retry",
                "Retrying request",
                serde_json::json!({ "attempt": attempt }),
            );
        }
    }

    async fn run_request(&self, builder: RequestBuilder) -> Result<Response, SchedulerError> {
        let _permit = self
            .semaphore
            .acquire()
            .await
            .map_err(|_| SchedulerError::Closed)?;
        self.wait_to_start().await;
        Ok(builder.send().await?)
    }

    async fn pause(&self, duration: Duration) {
        let mut timing = self.timing.lock().await;
        timing.paused_until = timing.paused_until.max(Instant::now() + duration);
    }

    async fn wait_to_start(&self) {
        loop {
            let delay = {
                let mut timing = self.timing.lock().await;
                let now = Instant::now();
                let start_at = timing.next_start.max(timing.paused_until);
                if start_at <= now {
                    timing.next_start = now + self.request_interval;
                    return;
                }
                start_at - now
            };
            sleep(delay).await;
        }
    }
}

pub type SharedScheduler = Arc<RequestScheduler>;

fn is_retryable_status(status: StatusCode) -> bool {
    status == StatusCode::REQUEST_TIMEOUT
        || status == StatusCode::TOO_MANY_REQUESTS
        || status.is_server_error()
}

fn retry_after(response: &Response) -> Option<Duration> {
    let value = response
        .headers()
        .get(reqwest::header::RETRY_AFTER)?
        .to_str()
        .ok()?;
    if let Ok(seconds) = value.parse::<u64>() {
        return Some(Duration::from_secs(seconds));
    }
    let date = chrono::DateTime::parse_from_rfc2822(value).ok()?;
    let now = chrono::Utc::now();
    (date.with_timezone(&chrono::Utc) - now)
        .to_std()
        .ok()
        .or(Some(Duration::ZERO))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn identifies_retryable_statuses() {
        assert!(is_retryable_status(StatusCode::TOO_MANY_REQUESTS));
        assert!(is_retryable_status(StatusCode::INTERNAL_SERVER_ERROR));
        assert!(!is_retryable_status(StatusCode::BAD_REQUEST));
    }
}
