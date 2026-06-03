use std::collections::HashMap;

use serde_json::Value;

use crate::types::{ArticleBlock, Post};

pub fn render_post_markdown(post: &Post, paths: &HashMap<String, String>) -> String {
    let content = match post.post_type.as_str() {
        "article" => render_article(post, paths),
        "file" => post.file_body().map_or_else(
            || format!("[unsupported post type: {}]", post.post_type),
            |body| {
                std::iter::once(body.text)
                    .chain(body.files.into_iter().map(|file| {
                        format!(
                            "[{}]({})",
                            file.name,
                            asset_link(paths, &format!("file:{}", file.id))
                        )
                    }))
                    .collect::<Vec<_>>()
                    .join("\n\n")
            },
        ),
        "image" => post.image_body().map_or_else(
            || format!("[unsupported post type: {}]", post.post_type),
            |body| {
                std::iter::once(body.text)
                    .chain(body.images.into_iter().map(|image| {
                        format!(
                            "![{}]({})",
                            image.id,
                            asset_link(paths, &format!("image:{}", image.id))
                        )
                    }))
                    .collect::<Vec<_>>()
                    .join("\n\n")
            },
        ),
        "text" => post.text_body().map_or_else(String::new, |body| body.text),
        "video" => post.video_body().map_or_else(
            || format!("[unsupported post type: {}]", post.post_type),
            |body| {
                format!(
                    "{}\n\n{}: {}",
                    body.text, body.video.service_provider, body.video.video_id
                )
            },
        ),
        _ => format!("[unsupported post type: {}]", post.post_type),
    };
    format!("# {}\n\n{}\n", post.title, content.trim())
}

fn asset_link(paths: &HashMap<String, String>, key: &str) -> String {
    paths
        .get(key)
        .cloned()
        .unwrap_or_else(|| format!("[missing asset: {key}]"))
}

fn render_article(post: &Post, paths: &HashMap<String, String>) -> String {
    let Some(body) = post.article_body() else {
        return format!("[unsupported post type: {}]", post.post_type);
    };
    body.blocks
        .into_iter()
        .map(|block| match block {
            ArticleBlock::File { file_id } => format!(
                "[{file_id}]({})",
                asset_link(paths, &format!("file:{file_id}"))
            ),
            ArticleBlock::Header { text } => format!("# {text}"),
            ArticleBlock::Image { image_id } => format!(
                "![{image_id}]({})",
                asset_link(paths, &format!("image:{image_id}"))
            ),
            ArticleBlock::Paragraph { text } => text,
            ArticleBlock::UrlEmbed { url_embed_id } => body
                .url_embed_map
                .get(&url_embed_id)
                .cloned()
                .unwrap_or(Value::String(url_embed_id))
                .to_string()
                .trim_matches('"')
                .to_string(),
            ArticleBlock::Unknown => "[unsupported block: unknown]".to_string(),
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use serde_json::json;

    use crate::types::Post;

    use super::render_post_markdown;

    fn base_post() -> serde_json::Value {
        json!({
            "commentCount": 0,
            "coverImageUrl": null,
            "creatorId": "creator",
            "excerpt": "",
            "feeRequired": 0,
            "hasAdultContent": false,
            "id": "123",
            "imageForShare": null,
            "isCommentingRestricted": false,
            "isLiked": false,
            "isPinned": false,
            "isRestricted": false,
            "likeCount": 0,
            "nextPost": null,
            "prevPost": null,
            "publishedDatetime": "2026-05-27T21:17:41+09:00",
            "tags": [],
            "title": "Title",
            "updatedDatetime": "2026-05-27T21:17:41+09:00",
            "user": { "iconUrl": "", "name": "Creator", "userId": "1" }
        })
    }

    #[test]
    fn renders_image_posts() {
        let mut value = base_post();
        value["type"] = json!("image");
        value["body"] = json!({ "images": [{ "extension": "png", "height": 1, "id": "image-id", "originalUrl": "https://example.test/image.png", "thumbnailUrl": "https://example.test/thumb.jpg", "width": 1 }], "text": "Hello" });
        let post: Post = serde_json::from_value(value).unwrap();
        let mut paths = HashMap::new();
        paths.insert("image:image-id".into(), "assets/image.png".into());
        assert!(render_post_markdown(&post, &paths).contains("![image-id](assets/image.png)"));
    }

    #[test]
    fn renders_article_blocks_in_order() {
        let mut value = base_post();
        value["type"] = json!("article");
        value["body"] = json!({ "blocks": [{ "text": "Header", "type": "header" }, { "text": "Paragraph", "type": "p" }, { "imageId": "image-id", "type": "image" }], "fileMap": {}, "imageMap": {}, "urlEmbedMap": {} });
        let post: Post = serde_json::from_value(value).unwrap();
        let mut paths = HashMap::new();
        paths.insert("image:image-id".into(), "assets/image.png".into());
        assert!(
            render_post_markdown(&post, &paths)
                .contains("# Header\n\nParagraph\n\n![image-id](assets/image.png)")
        );
    }

    #[test]
    fn renders_video_details() {
        let mut value = base_post();
        value["type"] = json!("video");
        value["body"] =
            json!({ "text": "Watch", "video": { "serviceProvider": "youtube", "videoId": "abc" } });
        let post: Post = serde_json::from_value(value).unwrap();
        assert!(render_post_markdown(&post, &HashMap::new()).contains("youtube: abc"));
    }
}
