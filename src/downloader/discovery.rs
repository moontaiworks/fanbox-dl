use std::collections::BTreeMap;

use anyhow::Result;
use serde_json::json;
use url::Url;

use crate::client::{FanboxApiError, FanboxClient};
use crate::types::{ListCreatorPostsParams, PaginateCreatorPostsParams, PostSort, PostSummary};

use super::errors::log_debug_error_response;
use super::logger::{LogFields, Logger};

const DEFAULT_PAGE_SIZE: u64 = 300;

pub async fn discover_creator_posts(client: &FanboxClient, creator_id: &str, logger: &Logger, page_size: Option<u64>) -> Result<Vec<PostSummary>> {
    let page_size = page_size.unwrap_or(DEFAULT_PAGE_SIZE);
    let mut found = BTreeMap::new();
    let mut cursor = ListCreatorPostsParams {
        creator_id: creator_id.to_string(),
        first_id: None,
        first_published_datetime: None,
        limit: Some(page_size),
        sort: Some(PostSort::Newest),
    };
    loop {
        let page = match client.list_creator_posts(cursor.clone()).await {
            Ok(page) => page,
            Err(error) => {
                if let Some(error) = error.downcast_ref::<FanboxApiError>() {
                    log_debug_error_response(logger, error, LogFields::from_iter([(String::from("creatorId"), json!(creator_id))]));
                }
                logger.warn("post.discovery.fallback", "Direct cursor failed; using paginateCreator", LogFields::from_iter([(String::from("creatorId"), json!(creator_id))]));
                fallback_paginate(client, creator_id, &mut found).await?;
                break;
            }
        };
        let added = add_posts(&page, &mut found);
        if page.len() < page_size as usize {
            break;
        }
        if added == 0 {
            logger.warn("post.discovery.fallback", "Direct cursor made no progress; using paginateCreator", LogFields::from_iter([(String::from("creatorId"), json!(creator_id))]));
            fallback_paginate(client, creator_id, &mut found).await?;
            break;
        }
        let last = page.last().unwrap();
        cursor = ListCreatorPostsParams {
            creator_id: creator_id.to_string(),
            first_id: Some(last.id.clone()),
            first_published_datetime: Some(last.published_datetime.clone()),
            limit: Some(page_size),
            sort: Some(PostSort::Newest),
        };
    }
    Ok(found.into_values().collect())
}

fn add_posts(posts: &[PostSummary], found: &mut BTreeMap<String, PostSummary>) -> usize {
    let mut added = 0;
    for post in posts {
        if !found.contains_key(&post.id) {
            found.insert(post.id.clone(), post.clone());
            added += 1;
        }
    }
    added
}

fn cursor_from_url(url: &str) -> Option<ListCreatorPostsParams> {
    let parsed = Url::parse(url).ok()?;
    let creator_id = parsed.query_pairs().find(|(key, _)| key == "creatorId")?.1.to_string();
    let query = parsed.query_pairs().collect::<BTreeMap<_, _>>();
    Some(ListCreatorPostsParams {
        creator_id,
        first_id: query.get("firstId").map(|value| value.to_string()),
        first_published_datetime: query.get("firstPublishedDatetime").map(|value| value.to_string()),
        limit: Some(query.get("limit").and_then(|value| value.parse::<u64>().ok()).unwrap_or(DEFAULT_PAGE_SIZE)),
        sort: Some(PostSort::Newest),
    })
}

async fn fallback_paginate(client: &FanboxClient, creator_id: &str, found: &mut BTreeMap<String, PostSummary>) -> Result<()> {
    for url in client.paginate_creator_posts(PaginateCreatorPostsParams { creator_id: creator_id.to_string(), sort: Some(PostSort::Newest) }).await? {
        if let Some(cursor) = cursor_from_url(&url) {
            add_posts(&client.list_creator_posts(cursor).await?, found);
        }
    }
    Ok(())
}
