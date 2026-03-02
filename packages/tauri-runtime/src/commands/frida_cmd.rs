use crate::state::frida_state::FridaManager;
use crate::state::store_state::StoreManager;
use crate::preamble;
use serde::Serialize;
use tauri::{AppHandle, State};

#[derive(Serialize, Clone)]
pub struct DeviceInfo {
    pub id: String,
    pub name: String,
    pub device_type: String,
}

/// 디바이스 목록 반환 (Frida devkit 없이는 스텁)
#[tauri::command]
pub fn frida_list_devices() -> Result<Vec<DeviceInfo>, String> {
    // frida-rust 미연동 상태에서는 로컬 디바이스만 반환
    Ok(vec![DeviceInfo {
        id: "local".to_string(),
        name: "Local System".to_string(),
        device_type: "local".to_string(),
    }])
}

/// 프로세스 spawn (스텁 — frida-rust 연동 시 실제 구현)
#[tauri::command]
pub fn frida_spawn(device_id: String, bundle_id: String) -> Result<u32, String> {
    // 실제 구현 시 frida-rust의 Device::spawn() 호출
    Err(format!(
        "Frida spawn not yet connected: device={}, bundle={}",
        device_id, bundle_id
    ))
}

/// 세션 attach (스텁)
#[tauri::command]
pub fn frida_attach(
    frida_manager: State<'_, FridaManager>,
    device_id: String,
    pid: u32,
) -> Result<String, String> {
    let session_id = format!("session_{}_{}", device_id, pid);
    frida_manager.add_session(&session_id, &device_id, pid);
    Ok(session_id)
}

/// 스크립트 로드 + __whale_store__ 프리앰블 자동 삽입
#[tauri::command]
pub fn frida_load_script(
    frida_manager: State<'_, FridaManager>,
    store_manager: State<'_, StoreManager>,
    session_id: String,
    code: String,
    store_name: Option<String>,
) -> Result<String, String> {
    let script_id = format!("script_{}", session_id);
    frida_manager.add_script(&script_id, &session_id);

    // __whale_store__ 프리앰블 삽입
    let _final_code = if let Some(ref name) = store_name {
        let initial_state = store_manager
            .get(name)
            .map(|s| serde_json::to_string(&s).unwrap_or_default())
            .unwrap_or_else(|| "{}".to_string());
        let preamble_code = preamble::generate(name, &initial_state);
        format!("{}\n\n{}", preamble_code, code)
    } else {
        code
    };

    // 실제 구현 시 session.create_script(&final_code) 호출
    Ok(script_id)
}

/// 파일에서 스크립트 로드
#[tauri::command]
pub fn frida_load_script_file(
    frida_manager: State<'_, FridaManager>,
    store_manager: State<'_, StoreManager>,
    session_id: String,
    path: String,
    store_name: Option<String>,
) -> Result<String, String> {
    let code = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read script file {}: {}", path, e))?;
    frida_load_script(frida_manager, store_manager, session_id, code, store_name)
}

/// 세션 detach
#[tauri::command]
pub fn frida_detach(
    frida_manager: State<'_, FridaManager>,
    session_id: String,
) -> Result<(), String> {
    frida_manager.remove_session(&session_id);
    Ok(())
}
