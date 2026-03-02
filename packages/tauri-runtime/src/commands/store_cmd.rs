use crate::state::store_state::StoreManager;
use serde_json::Value;
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub fn store_register(
    store_manager: State<'_, StoreManager>,
    name: String,
    defaults: HashMap<String, Value>,
) {
    store_manager.register(&name, defaults);
}

#[tauri::command]
pub fn store_get(
    store_manager: State<'_, StoreManager>,
    name: String,
) -> Option<HashMap<String, Value>> {
    store_manager.get(&name)
}

#[tauri::command]
pub fn store_set(
    app: AppHandle,
    store_manager: State<'_, StoreManager>,
    name: String,
    key: String,
    value: Value,
) {
    if let Some(patch) = store_manager.set(&name, &key, value) {
        let payload = serde_json::json!({
            "store": name,
            "patch": patch,
        });
        let changed_keys: Vec<String> = patch.keys().cloned().collect();
        let targets = store_manager.get_subscribed_windows(&name, &changed_keys);
        if targets.is_empty() {
            // No subscriptions registered yet — broadcast to all (backwards compat)
            let _ = app.emit("store:changed", &payload);
        } else {
            for label in targets {
                let _ = app.emit_to(&label, "store:changed", &payload);
            }
        }
    }
}

#[tauri::command]
pub fn store_get_all(
    store_manager: State<'_, StoreManager>,
    name: String,
) -> Option<HashMap<String, Value>> {
    store_manager.get(&name)
}

#[tauri::command]
pub fn store_subscribe(
    store_manager: State<'_, StoreManager>,
    name: String,
    window: String,
    keys: Vec<String>,
) {
    store_manager.subscribe(&name, &window, keys);
}

#[tauri::command]
pub fn store_unsubscribe(
    store_manager: State<'_, StoreManager>,
    name: String,
    window: String,
) {
    store_manager.unsubscribe(&name, &window);
}
