use crate::state::store_state::StoreManager;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::OnceLock;
use tauri::{AppHandle, Emitter, Manager};

/// __whale 마커가 있는 메시지에서 store_name과 patch를 추출
/// 마커가 없거나 형식이 맞지 않으면 None 반환
pub fn parse_whale_message(message: &Value) -> Option<(String, HashMap<String, Value>)> {
    let obj = message.as_object()?;
    if obj.get("__whale").and_then(|v| v.as_bool()) != Some(true) {
        return None;
    }
    let store_name = obj.get("store").and_then(|v| v.as_str())?.to_string();
    let patch = obj.get("patch").and_then(|v| v.as_object())?;
    let patch_map: HashMap<String, Value> =
        patch.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
    Some((store_name, patch_map))
}

fn env_flag_enabled(name: &str) -> bool {
    matches!(
        std::env::var(name)
            .ok()
            .as_deref()
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("1" | "true" | "yes" | "on")
    )
}

fn devtools_frida_log_stream_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| env_flag_enabled("WHALE_DEVTOOLS_FRIDA_LOG"))
}

/// Frida 스크립트에서 send()된 메시지를 처리
/// __whale 마커가 있으면 store를 자동 업데이트하고 윈도우에 emit
pub fn handle_frida_message(app: &AppHandle, message: &Value) {
    // Emit to devtools in debug mode
    if cfg!(debug_assertions) && devtools_frida_log_stream_enabled() {
        let _ = app.emit("devtools:log", &serde_json::json!({
            "source": "frida",
            "level": "info",
            "message": message.to_string(),
        }));
    }

    if let Some((store_name, patch_map)) = parse_whale_message(message) {
        let store_manager = app.state::<StoreManager>();
        let Some(changed_keys) = store_manager.merge_patch_ref(&store_name, &patch_map) else {
            return;
        };
        if changed_keys.is_empty() {
            return;
        }

        let payload = serde_json::json!({
            "store": &store_name,
            "patch": patch_map,
        });
        let targets = store_manager.get_subscribed_windows(&store_name, &changed_keys);
        if targets.is_empty() {
            let _ = app.emit("store:changed", &payload);
        } else {
            for label in targets {
                let _ = app.emit_to(&label, "store:changed", &payload);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_parse_whale_message_valid() {
        let msg = json!({
            "__whale": true,
            "store": "trainer",
            "patch": { "speed": 2.0, "hp": 999 }
        });

        let result = parse_whale_message(&msg);
        assert!(result.is_some());

        let (store_name, patch) = result.unwrap();
        assert_eq!(store_name, "trainer");
        assert_eq!(patch.get("speed"), Some(&json!(2.0)));
        assert_eq!(patch.get("hp"), Some(&json!(999)));
    }

    #[test]
    fn test_parse_whale_message_no_marker() {
        let msg = json!({
            "store": "trainer",
            "patch": { "speed": 2.0 }
        });
        assert!(parse_whale_message(&msg).is_none());
    }

    #[test]
    fn test_parse_whale_message_marker_false() {
        let msg = json!({
            "__whale": false,
            "store": "trainer",
            "patch": { "speed": 2.0 }
        });
        assert!(parse_whale_message(&msg).is_none());
    }

    #[test]
    fn test_parse_whale_message_not_object() {
        let msg = json!("hello");
        assert!(parse_whale_message(&msg).is_none());
    }

    #[test]
    fn test_parse_whale_message_null() {
        let msg = json!(null);
        assert!(parse_whale_message(&msg).is_none());
    }

    #[test]
    fn test_parse_whale_message_missing_store() {
        let msg = json!({
            "__whale": true,
            "patch": { "speed": 2.0 }
        });
        assert!(parse_whale_message(&msg).is_none());
    }

    #[test]
    fn test_parse_whale_message_missing_patch() {
        let msg = json!({
            "__whale": true,
            "store": "trainer"
        });
        assert!(parse_whale_message(&msg).is_none());
    }

    #[test]
    fn test_parse_whale_message_patch_not_object() {
        let msg = json!({
            "__whale": true,
            "store": "trainer",
            "patch": "not_an_object"
        });
        assert!(parse_whale_message(&msg).is_none());
    }

    #[test]
    fn test_parse_whale_message_empty_patch() {
        let msg = json!({
            "__whale": true,
            "store": "trainer",
            "patch": {}
        });
        let result = parse_whale_message(&msg);
        assert!(result.is_some());
        let (store_name, patch) = result.unwrap();
        assert_eq!(store_name, "trainer");
        assert!(patch.is_empty());
    }

    #[test]
    fn test_parse_ignores_non_whale_frida_messages() {
        // Typical Frida log message
        let msg = json!({
            "type": "log",
            "payload": "some log output"
        });
        assert!(parse_whale_message(&msg).is_none());
    }
}
