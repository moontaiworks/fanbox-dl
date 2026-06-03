use serde_json::json;

use crate::http::HttpResponse;

use super::logger::{LogFields, Logger};

pub fn log_debug_error_response(logger: &Logger, error: &(dyn std::error::Error + 'static), mut fields: LogFields) {
    if let Some(response) = error.downcast_ref::<crate::client::FanboxApiError>() {
        fields.insert("body".into(), response.body.clone());
        fields.insert("status".into(), json!(response.status));
        fields.insert("statusText".into(), json!(response.status_text));
        logger.debug("api.response.error", "HTTP error response", fields);
        return;
    }
    if let Some(response) = error.downcast_ref::<super::asset::AssetDownloadError>() {
        fields.insert("body".into(), response.body.clone());
        fields.insert("status".into(), json!(response.status));
        fields.insert("statusText".into(), json!(response.status_text));
        logger.debug("api.response.error", "HTTP error response", fields);
    }
}

pub fn log_debug_response(logger: &Logger, response: &HttpResponse, mut fields: LogFields) {
    fields.insert("body".into(), response.json_or_text());
    fields.insert("status".into(), json!(response.status));
    fields.insert("statusText".into(), json!(response.status_text));
    logger.debug("api.response.error", "HTTP error response", fields);
}
