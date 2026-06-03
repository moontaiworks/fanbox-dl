use std::collections::BTreeSet;

use anyhow::Result;

use crate::client::FanboxClient;

use super::options::DownloadOptions;

pub async fn resolve_creator_ids(client: &FanboxClient, options: &DownloadOptions) -> Result<Vec<String>> {
    let mut creator_ids = BTreeSet::from_iter(options.creator_ids.iter().cloned());
    if options.following {
        for creator in client.list_following_creators().await? {
            creator_ids.insert(creator.creator_id);
        }
    }
    if options.supporting {
        for plan in client.list_supporting_plans().await? {
            creator_ids.insert(plan.plan.creator_id);
        }
    }
    for ignored in &options.ignore_creator_ids {
        creator_ids.remove(ignored);
    }
    Ok(creator_ids.into_iter().collect())
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use serde_json::json;

    use crate::client::FanboxClient;
    use crate::downloader::scheduler::RequestScheduler;
    use crate::http::{HttpResponse, RecordingHttpClient};

    use super::*;

    #[tokio::test]
    async fn unions_explicit_following_and_supporting_creators() {
        let http = RecordingHttpClient::new(vec![
            Ok(HttpResponse { body: serde_json::to_vec(&json!({ "body": [{ "creatorId": "followed", "description": "", "hasAdultContent": false, "iconUrl": "", "isFollowed": true, "isSupported": false, "name": "", "userId": "1" }, { "creatorId": "shared", "description": "", "hasAdultContent": false, "iconUrl": "", "isFollowed": true, "isSupported": true, "name": "", "userId": "2" }] })).unwrap(), headers: Default::default(), status: 200, status_text: "OK".into() }),
            Ok(HttpResponse { body: serde_json::to_vec(&json!({ "body": [{ "coverImageUrl": null, "creatorId": "supported", "description": "", "fee": 100, "hasAdultContent": false, "id": "1", "paymentMethod": "card", "perks": [], "title": "", "user": { "iconUrl": "", "name": "", "userId": "1" } }, { "coverImageUrl": null, "creatorId": "shared", "description": "", "fee": 100, "id": "2", "paymentMethod": "card", "perks": [], "title": "", "user": { "iconUrl": "", "name": "", "userId": "1" } }] })).unwrap(), headers: Default::default(), status: 200, status_text: "OK".into() }),
        ]);
        let client = FanboxClient::new(None, None, Arc::new(http), RequestScheduler::new(1), None).unwrap();
        let ids = resolve_creator_ids(&client, &DownloadOptions {
            concurrency: 3,
            cookie: None,
            creator_ids: vec!["explicit".into()],
            dry_run: false,
            following: true,
            ignore_creator_ids: vec!["shared".into()],
            log_format: super::super::logger::LogFormat::Json,
            max_retries: 5,
            output: std::path::PathBuf::from("fanbox-downloads"),
            rate_limit_pause_ms: 60_000,
            request_interval_ms: 0,
            supporting: true,
            user_agent: None,
            verbose: false,
            verify_assets: false,
        }).await.unwrap();
        assert_eq!(ids, vec!["explicit", "followed", "supported"]);
    }
}
