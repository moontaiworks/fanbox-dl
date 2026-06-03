use std::path::{Path, PathBuf};

use unicode_segmentation::UnicodeSegmentation;

const DEFAULT_COMPONENT_BYTES: usize = 120;
const DEFAULT_PATH_BYTES: usize = 240;

#[derive(Clone, Debug, Default)]
pub struct SanitizePathComponentOptions {
    pub max_bytes: Option<usize>,
    pub reserve_bytes: Option<usize>,
    pub suffix: Option<String>,
}

pub fn assert_path_budget(path: &Path, max_bytes: usize) -> anyhow::Result<()> {
    if path.to_string_lossy().len() > max_bytes {
        anyhow::bail!(
            "Path exceeds {max_bytes} byte path budget: {}",
            path.display()
        );
    }
    Ok(())
}

pub fn create_creator_directory_name(
    creator_id: &str,
    output_directory: &Path,
) -> anyhow::Result<String> {
    sanitize_path_component_for_directory(
        creator_id,
        output_directory,
        SanitizePathComponentOptions {
            reserve_bytes: Some(std::path::MAIN_SEPARATOR_STR.len() + "manifest.json".len()),
            ..SanitizePathComponentOptions::default()
        },
    )
}

pub fn create_post_directory_name(
    id: &str,
    published_datetime: &str,
    title: &str,
    parent_directory: Option<&Path>,
) -> anyhow::Result<String> {
    let date = published_datetime.chars().take(10).collect::<String>();
    let prefix = format!("{date}_{id}_");
    let options = SanitizePathComponentOptions {
        max_bytes: Some(DEFAULT_COMPONENT_BYTES.saturating_sub(prefix.len())),
        reserve_bytes: Some(
            prefix.len() + std::path::MAIN_SEPARATOR_STR.len() + "metadata.json".len(),
        ),
        suffix: None,
    };
    let title = if let Some(parent_directory) = parent_directory {
        sanitize_path_component_for_directory(title, parent_directory, options)?
    } else {
        sanitize_path_component(title, options)
    };
    Ok(format!("{prefix}{title}"))
}

#[must_use]
pub fn sanitize_path_component(value: &str, options: SanitizePathComponentOptions) -> String {
    let max_bytes = options.max_bytes.unwrap_or(DEFAULT_COMPONENT_BYTES);
    let suffix = options.suffix.unwrap_or_default();
    let mut sanitized = value
        .graphemes(true)
        .map(|grapheme| {
            if grapheme.chars().all(|character| character <= '\u{1f}') {
                "_".to_string()
            } else {
                grapheme.to_string()
            }
        })
        .collect::<String>()
        .chars()
        .map(|character| match character {
            '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '_',
            other => other,
        })
        .collect::<String>();
    sanitized = sanitized.trim_end_matches(['.', ' ']).to_string();
    if sanitized.is_empty() {
        sanitized = "_".to_string();
    }
    if is_reserved_name(&sanitized) || starts_with_reserved_prefix(value) {
        sanitized = format!("_{sanitized}");
    }
    let suffix_bytes = suffix.len();
    format!(
        "{}{}",
        truncate_utf8(&sanitized, max_bytes.saturating_sub(suffix_bytes)),
        suffix
    )
}

pub fn sanitize_path_component_for_directory(
    value: &str,
    directory: &Path,
    mut options: SanitizePathComponentOptions,
) -> anyhow::Result<String> {
    let available_bytes = DEFAULT_PATH_BYTES
        .saturating_sub(
            directory
                .canonicalize()
                .unwrap_or_else(|_| PathBuf::from(directory))
                .to_string_lossy()
                .len(),
        )
        .saturating_sub(std::path::MAIN_SEPARATOR_STR.len())
        .saturating_sub(options.reserve_bytes.unwrap_or(0));
    if available_bytes <= options.suffix.as_ref().map_or(0, String::len) {
        anyhow::bail!(
            "Directory leaves no room in path budget: {}",
            directory.display()
        );
    }
    options.max_bytes = Some(
        options
            .max_bytes
            .unwrap_or(DEFAULT_COMPONENT_BYTES)
            .min(available_bytes),
    );
    Ok(sanitize_path_component(value, options))
}

fn truncate_utf8(value: &str, max_bytes: usize) -> String {
    let mut result = String::new();
    for grapheme in value.graphemes(true) {
        if result.len() + grapheme.len() > max_bytes {
            break;
        }
        result.push_str(grapheme);
    }
    result
}

fn is_reserved_name(value: &str) -> bool {
    let uppercase = value.to_ascii_uppercase();
    matches!(uppercase.as_str(), "AUX" | "CON" | "NUL" | "PRN")
        || uppercase.starts_with("COM")
            && uppercase[3..].chars().all(|ch| ('1'..='9').contains(&ch))
        || uppercase.starts_with("LPT")
            && uppercase[3..].chars().all(|ch| ('1'..='9').contains(&ch))
}

fn starts_with_reserved_prefix(value: &str) -> bool {
    let upper = value.trim_start_matches('.').to_ascii_uppercase();
    [
        "AUX", "CON", "NUL", "PRN", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
        "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ]
    .into_iter()
    .any(|name| {
        upper == name
            || upper.starts_with(&format!("{name}."))
            || upper.starts_with(&format!("{name} "))
            || upper.starts_with(&format!("{name}<"))
            || upper.starts_with(&format!("{name}>"))
            || upper.starts_with(&format!("{name}:"))
            || upper.starts_with(&format!("{name}\""))
            || upper.starts_with(&format!("{name}/"))
            || upper.starts_with(&format!("{name}\\"))
            || upper.starts_with(&format!("{name}|"))
            || upper.starts_with(&format!("{name}?"))
            || upper.starts_with(&format!("{name}*"))
    })
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{
        SanitizePathComponentOptions, assert_path_budget, create_creator_directory_name,
        create_post_directory_name, sanitize_path_component, sanitize_path_component_for_directory,
    };

    #[test]
    fn removes_invalid_characters_and_protects_reserved_names() {
        assert_eq!(
            sanitize_path_component("CON<>:\"/\\|?*. ", SanitizePathComponentOptions::default()),
            "_CON_________"
        );
    }

    #[test]
    fn truncates_utf8_without_breaking_suffix() {
        let value = sanitize_path_component(
            &"界".repeat(100),
            SanitizePathComponentOptions {
                max_bytes: Some(20),
                suffix: Some("_123.png".into()),
                reserve_bytes: None,
            },
        );
        assert!(value.len() <= 20);
        assert!(value.ends_with("_123.png"));
    }

    #[test]
    fn truncates_component_to_fit_directory() {
        let directory = Path::new("/tmp/nested");
        let value = sanitize_path_component_for_directory(
            &"x".repeat(300),
            directory,
            SanitizePathComponentOptions {
                suffix: Some(".png".into()),
                ..SanitizePathComponentOptions::default()
            },
        )
        .unwrap();
        assert!(directory.join(&value).to_string_lossy().len() <= 240);
        assert!(value.ends_with(".png"));
    }

    #[test]
    fn creates_safe_creator_directory() {
        assert_eq!(
            create_creator_directory_name("../creator", Path::new("/tmp")).unwrap(),
            ".._creator"
        );
    }

    #[test]
    fn creates_post_directory_name() {
        assert_eq!(
            create_post_directory_name("123", "2026-05-27T21:17:41+09:00", "A title", None)
                .unwrap(),
            "2026-05-27_123_A title"
        );
    }

    #[test]
    fn rejects_path_over_budget() {
        assert!(assert_path_budget(Path::new(&format!("/tmp/{}", "x".repeat(300))), 240).is_err());
    }
}
