use crate::commands::access::ensure_devtools_access;
use crate::state::input_state::{HotkeyEntry, InputManager};
use crate::state::store_state::StoreManager;
use serde_json::Value;
use std::collections::HashMap;
use tauri::{State, WebviewWindow};

/// Return all registered stores and their current values
#[tauri::command]
pub fn devtools_list_stores(
    window: WebviewWindow,
    store_manager: State<'_, StoreManager>,
) -> Result<HashMap<String, HashMap<String, Value>>, String> {
    ensure_devtools_access(&window)?;
    Ok(store_manager.list_all())
}

/// Return all registered hotkeys
#[tauri::command]
pub fn devtools_list_hotkeys(
    window: WebviewWindow,
    input_manager: State<'_, InputManager>,
) -> Result<Vec<HotkeyEntry>, String> {
    ensure_devtools_access(&window)?;
    Ok(input_manager.list_hotkeys())
}
