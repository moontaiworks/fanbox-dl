use std::path::{Path, PathBuf};
use thiserror::Error;
use unicode_segmentation::UnicodeSegmentation;

const DEFAULT_COMPONENT_BYTES: usize = 120;
const DEFAULT_PATH_BYTES: usize = 240;

#[derive(Debug, Error)]
pub enum PathError {
    #[error("Path exceeds {max_bytes} byte path budget: {path}")]
    Budget { path: String, max_bytes: usize },
    #[error("Directory leaves no room in path budget: {0}")]
    NoRoom(String),
}

#[derive(Clone, Debug, Default)]
pub struct SanitizeOptions {
    pub max_bytes: Option<usize>,
    pub reserve_bytes: usize,
    pub suffix: String,
}

pub fn assert_path_budget(path: &Path) -> Result<(), PathError> {
    let resolved = path.to_string_lossy();
    if resolved.len() > DEFAULT_PATH_BYTES {
        return Err(PathError::Budget {
            path: resolved.into_owned(),
            max_bytes: DEFAULT_PATH_BYTES,
        });
    }
    Ok(())
}

pub fn create_creator_directory_name(creator_id: &str, output: &Path) -> Result<String, PathError> {
    sanitize_path_component_for_directory(
        creator_id,
        output,
        SanitizeOptions {
            reserve_bytes: "/manifest.json".len(),
            ..Default::default()
        },
    )
}

pub fn create_post_directory_name(
    id: &str,
    published_datetime: &str,
    title: &str,
    parent: &Path,
) -> Result<String, PathError> {
    let date = published_datetime.get(0..10).unwrap_or("unknown");
    let prefix = format!("{date}_{id}_");
    let title = sanitize_path_component_for_directory(
        title,
        parent,
        SanitizeOptions {
            max_bytes: Some(DEFAULT_COMPONENT_BYTES.saturating_sub(prefix.len())),
            reserve_bytes: format!("{prefix}/metadata.json").len(),
            suffix: String::new(),
        },
    )?;
    Ok(format!("{prefix}{title}"))
}

pub fn sanitize_path_component(value: &str, options: SanitizeOptions) -> String {
    let max_bytes = options.max_bytes.unwrap_or(DEFAULT_COMPONENT_BYTES);
    let suffix = options.suffix;
    let mut sanitized = value
        .graphemes(true)
        .map(|segment| {
            if segment
                .chars()
                .next()
                .is_some_and(|character| character <= '\u{1f}')
            {
                "_".to_string()
            } else {
                segment.to_string()
            }
        })
        .collect::<String>()
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            other => other,
        })
        .collect::<String>();
    while sanitized.ends_with('.') || sanitized.ends_with(' ') {
        sanitized.pop();
    }
    if is_reserved_name(&sanitized) || has_reserved_prefix(value) {
        sanitized = format!("_{sanitized}");
    }
    if sanitized.is_empty() {
        sanitized = "_".to_string();
    }
    let available = max_bytes.saturating_sub(suffix.len());
    format!("{}{}", truncate_utf8(&sanitized, available), suffix)
}

pub fn sanitize_path_component_for_directory(
    value: &str,
    directory: &Path,
    options: SanitizeOptions,
) -> Result<String, PathError> {
    let available = DEFAULT_PATH_BYTES
        .saturating_sub(directory.to_string_lossy().len())
        .saturating_sub(1)
        .saturating_sub(options.reserve_bytes);
    if available <= options.suffix.len() {
        return Err(PathError::NoRoom(directory.to_string_lossy().into_owned()));
    }
    Ok(sanitize_path_component(
        value,
        SanitizeOptions {
            max_bytes: Some(
                options
                    .max_bytes
                    .unwrap_or(DEFAULT_COMPONENT_BYTES)
                    .min(available),
            ),
            ..options
        },
    ))
}

pub fn join_posix(parts: &[&str]) -> String {
    parts.join("/")
}

pub fn from_posix(root: &Path, relative: &str) -> PathBuf {
    relative
        .split('/')
        .fold(root.to_path_buf(), |path, part| path.join(part))
}

fn truncate_utf8(value: &str, max_bytes: usize) -> String {
    let mut result = String::new();
    for segment in value.graphemes(true) {
        if result.len() + segment.len() > max_bytes {
            break;
        }
        result.push_str(segment);
    }
    result
}

fn is_reserved_name(value: &str) -> bool {
    let upper = value.to_ascii_uppercase();
    let base = upper.split('.').next().unwrap_or("");
    matches!(base, "AUX" | "CON" | "NUL" | "PRN")
        || (base.len() == 4
            && (base.starts_with("COM") || base.starts_with("LPT"))
            && base[3..]
                .parse::<u8>()
                .is_ok_and(|number| (1..=9).contains(&number)))
}

fn has_reserved_prefix(value: &str) -> bool {
    let upper = value.to_ascii_uppercase();
    [
        "AUX", "CON", "NUL", "PRN", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ]
    .iter()
    .any(|prefix| {
        let Some(rest) = upper.strip_prefix(prefix) else {
            return false;
        };
        rest.is_empty()
            || rest
                .chars()
                .next()
                .is_some_and(|character| ". <>:\"/\\|?*".contains(character))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sanitizes_reserved_and_invalid_names() {
        assert_eq!(
            sanitize_path_component("CON?.txt", SanitizeOptions::default()),
            "_CON_.txt"
        );
    }

    #[test]
    fn truncates_without_splitting_graphemes() {
        let value = sanitize_path_component(
            "a😀b",
            SanitizeOptions {
                max_bytes: Some(5),
                ..Default::default()
            },
        );
        assert_eq!(value, "a😀");
    }
}
