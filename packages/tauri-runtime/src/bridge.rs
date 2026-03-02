use crate::state::store_state::StoreManager;
use serde_json::Value;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager};

/// Frida 스크립트에서 send()된 메시지를 처리
/// __whale 마커가 있으면 store를 자동 업데이트하고 윈도우에 emit
pub fn handle_frida_message(app: &AppHandle, message: &Value) {
    if let Some(obj) = message.as_object() {
        if obj.get("__whale").and_then(|v| v.as_bool()) == Some(true) {
            if let (Some(store_name), Some(patch)) = (
                obj.get("store").and_then(|v| v.as_str()),
                obj.get("patch").and_then(|v| v.as_object()),
            ) {
                let store_manager = app.state::<StoreManager>();
                let patch_map: HashMap<String, Value> =
                    patch.iter().map(|(k, v)| (k.clone(), v.clone())).collect();

                store_manager.merge_patch(store_name, patch_map.clone());

                let payload = serde_json::json!({
                    "store": store_name,
                    "patch": patch_map,
                });
                let _ = app.emit("store:changed", &payload);
            }
        }
    }
}
