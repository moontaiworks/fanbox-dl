use crate::types::Post;
use serde_json::Value;
use std::collections::BTreeMap;

pub fn render_post_markdown(post: &Post, paths: &BTreeMap<String, String>) -> String {
    let content = match post.kind.as_str() {
        "article" => render_article(post, paths),
        "file" => render_file(post, paths),
        "image" => render_image(post, paths),
        "text" => text_field(post.body_value(), "text"),
        "video" => render_video(post),
        other => format!("[unsupported post type: {other}]"),
    };
    format!("# {}\n\n{}\n", post.title, content.trim())
}

fn render_article(post: &Post, paths: &BTreeMap<String, String>) -> String {
    let Some(body) = post.body_value() else {
        return String::new();
    };
    let blocks = body
        .get("blocks")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let file_map = body.get("fileMap").cloned().unwrap_or(Value::Null);
    let url_embed_map = body.get("urlEmbedMap").cloned().unwrap_or(Value::Null);
    blocks
        .into_iter()
        .map(|block| {
            match block
                .get("type")
                .and_then(Value::as_str)
                .unwrap_or_default()
            {
                "file" => {
                    let id = block
                        .get("fileId")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    let name = file_map
                        .get(id)
                        .and_then(|file| file.get("name"))
                        .and_then(Value::as_str)
                        .unwrap_or(id);
                    format!("[{}]({})", name, asset_link(paths, &format!("file:{id}")))
                }
                "header" => format!(
                    "# {}",
                    block
                        .get("text")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                ),
                "image" => {
                    let id = block
                        .get("imageId")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    format!("![{}]({})", id, asset_link(paths, &format!("image:{id}")))
                }
                "p" => block
                    .get("text")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string(),
                "url_embed" => {
                    let id = block
                        .get("urlEmbedId")
                        .and_then(Value::as_str)
                        .unwrap_or_default();
                    url_embed_map
                        .get(id)
                        .map(Value::to_string)
                        .unwrap_or_else(|| id.to_string())
                }
                other => format!("[unsupported block: {other}]"),
            }
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

fn render_file(post: &Post, paths: &BTreeMap<String, String>) -> String {
    let Some(body) = post.body_value() else {
        return String::new();
    };
    let mut parts = vec![text_field(Some(body), "text")];
    if let Some(files) = body.get("files").and_then(Value::as_array) {
        for file in files {
            let id = file.get("id").and_then(Value::as_str).unwrap_or_default();
            let name = file.get("name").and_then(Value::as_str).unwrap_or(id);
            parts.push(format!(
                "[{}]({})",
                name,
                asset_link(paths, &format!("file:{id}"))
            ));
        }
    }
    parts.join("\n\n")
}

fn render_image(post: &Post, paths: &BTreeMap<String, String>) -> String {
    let Some(body) = post.body_value() else {
        return String::new();
    };
    let mut parts = vec![text_field(Some(body), "text")];
    if let Some(images) = body.get("images").and_then(Value::as_array) {
        for image in images {
            let id = image.get("id").and_then(Value::as_str).unwrap_or_default();
            parts.push(format!(
                "![{}]({})",
                id,
                asset_link(paths, &format!("image:{id}"))
            ));
        }
    }
    parts.join("\n\n")
}

fn render_video(post: &Post) -> String {
    let text = text_field(post.body_value(), "text");
    let Some(video) = post.body_value().and_then(|body| body.get("video")) else {
        return text;
    };
    let provider = video
        .get("serviceProvider")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let video_id = video
        .get("videoId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    format!("{text}\n\n{provider}: {video_id}")
}

fn text_field(value: Option<&Value>, key: &str) -> String {
    value
        .and_then(|value| value.get(key))
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string()
}

fn asset_link(paths: &BTreeMap<String, String>, key: &str) -> String {
    paths
        .get(key)
        .cloned()
        .unwrap_or_else(|| format!("[missing asset: {key}]"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_text_post() {
        let post: Post = serde_json::from_value(serde_json::json!({
            "id": "1",
            "creatorId": "creator",
            "publishedDatetime": "2026-01-01T00:00:00+09:00",
            "title": "Title",
            "type": "text",
            "updatedDatetime": "2026-01-01T00:00:00+09:00",
            "body": { "text": "Hello" },
            "user": { "iconUrl": "", "name": "Creator", "userId": "1" }
        }))
        .unwrap();
        assert_eq!(
            render_post_markdown(&post, &BTreeMap::new()),
            "# Title\n\nHello\n"
        );
    }
}
