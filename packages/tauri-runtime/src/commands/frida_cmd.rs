use crate::preamble;
use crate::state::frida_state::{
    DeviceInfoData, FridaManager, FridaRequest, FridaResponse, FridaSender, ProcessInfoData,
};
use crate::state::store_state::StoreManager;
use tauri::State;

// ---------------------------------------------------------------------------
// Helper: send a request to the frida worker and extract the typed response
// ---------------------------------------------------------------------------

fn request_devices(frida: &FridaSender) -> Result<Vec<DeviceInfoData>, String> {
    match frida.send(|reply| FridaRequest::ListDevices { reply }) {
        FridaResponse::Devices(r) => r,
        _ => Err("Unexpected response type".to_string()),
    }
}

fn request_processes(
    frida: &FridaSender,
    device_id: String,
) -> Result<Vec<ProcessInfoData>, String> {
    match frida.send(|reply| FridaRequest::EnumerateProcesses { device_id, reply }) {
        FridaResponse::Processes(r) => r,
        _ => Err("Unexpected response type".to_string()),
    }
}

fn request_spawn(
    frida: &FridaSender,
    device_id: String,
    program: String,
) -> Result<u32, String> {
    match frida.send(|reply| FridaRequest::Spawn {
        device_id,
        program,
        reply,
    }) {
        FridaResponse::Pid(r) => r,
        _ => Err("Unexpected response type".to_string()),
    }
}

fn request_resume(frida: &FridaSender, device_id: String, pid: u32) -> Result<(), String> {
    match frida.send(|reply| FridaRequest::Resume {
        device_id,
        pid,
        reply,
    }) {
        FridaResponse::Unit(r) => r,
        _ => Err("Unexpected response type".to_string()),
    }
}

fn request_attach(frida: &FridaSender, device_id: String, pid: u32) -> Result<String, String> {
    match frida.send(|reply| FridaRequest::Attach {
        device_id,
        pid,
        reply,
    }) {
        FridaResponse::SessionId(r) => r,
        _ => Err("Unexpected response type".to_string()),
    }
}

fn request_load_script(
    frida: &FridaSender,
    session_id: String,
    code: String,
) -> Result<String, String> {
    match frida.send(|reply| FridaRequest::LoadScript {
        session_id,
        code,
        reply,
    }) {
        FridaResponse::ScriptId(r) => r,
        _ => Err("Unexpected response type".to_string()),
    }
}

fn request_unload_script(frida: &FridaSender, script_id: String) -> Result<(), String> {
    match frida.send(|reply| FridaRequest::UnloadScript { script_id, reply }) {
        FridaResponse::Unit(r) => r,
        _ => Err("Unexpected response type".to_string()),
    }
}

fn request_detach(frida: &FridaSender, session_id: String) -> Result<(), String> {
    match frida.send(|reply| FridaRequest::Detach { session_id, reply }) {
        FridaResponse::Unit(r) => r,
        _ => Err("Unexpected response type".to_string()),
    }
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

/// List all frida devices
#[tauri::command]
pub async fn frida_list_devices(
    frida: State<'_, FridaManager>,
) -> Result<Vec<DeviceInfoData>, String> {
    let sender = frida.inner().clone_sender();
    tauri::async_runtime::spawn_blocking(move || request_devices(&sender))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Enumerate processes on a device
#[tauri::command]
pub async fn frida_enumerate_processes(
    frida: State<'_, FridaManager>,
    device_id: String,
) -> Result<Vec<ProcessInfoData>, String> {
    let sender = frida.inner().clone_sender();
    tauri::async_runtime::spawn_blocking(move || request_processes(&sender, device_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Spawn a process on a device
#[tauri::command]
pub async fn frida_spawn(
    frida: State<'_, FridaManager>,
    device_id: String,
    program: String,
) -> Result<u32, String> {
    let sender = frida.inner().clone_sender();
    tauri::async_runtime::spawn_blocking(move || request_spawn(&sender, device_id, program))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Resume a spawned process
#[tauri::command]
pub async fn frida_resume(
    frida: State<'_, FridaManager>,
    device_id: String,
    pid: u32,
) -> Result<(), String> {
    let sender = frida.inner().clone_sender();
    tauri::async_runtime::spawn_blocking(move || request_resume(&sender, device_id, pid))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Attach to a process on a device
#[tauri::command]
pub async fn frida_attach(
    frida: State<'_, FridaManager>,
    device_id: String,
    pid: u32,
) -> Result<String, String> {
    let sender = frida.inner().clone_sender();
    tauri::async_runtime::spawn_blocking(move || request_attach(&sender, device_id, pid))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Load a script into a session, with optional __whale_store__ preamble
#[tauri::command]
pub async fn frida_load_script(
    frida: State<'_, FridaManager>,
    store_manager: State<'_, StoreManager>,
    session_id: String,
    code: String,
    store_name: Option<String>,
) -> Result<String, String> {
    // Build final code with preamble if store_name is provided
    let final_code = if let Some(ref name) = store_name {
        let initial_state = store_manager
            .get(name)
            .map(|s| serde_json::to_string(&s).unwrap_or_default())
            .unwrap_or_else(|| "{}".to_string());
        let preamble_code = preamble::generate(name, &initial_state);
        format!("{}\n\n{}", preamble_code, code)
    } else {
        code
    };

    let sender = frida.inner().clone_sender();
    tauri::async_runtime::spawn_blocking(move || request_load_script(&sender, session_id, final_code))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Load a script from a file path
#[tauri::command]
pub async fn frida_load_script_file(
    frida: State<'_, FridaManager>,
    store_manager: State<'_, StoreManager>,
    session_id: String,
    path: String,
    store_name: Option<String>,
) -> Result<String, String> {
    let code = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read script file {}: {}", path, e))?;

    // Build final code with preamble if store_name is provided
    let final_code = if let Some(ref name) = store_name {
        let initial_state = store_manager
            .get(name)
            .map(|s| serde_json::to_string(&s).unwrap_or_default())
            .unwrap_or_else(|| "{}".to_string());
        let preamble_code = preamble::generate(name, &initial_state);
        format!("{}\n\n{}", preamble_code, code)
    } else {
        code
    };

    let sender = frida.inner().clone_sender();
    tauri::async_runtime::spawn_blocking(move || request_load_script(&sender, session_id, final_code))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Unload a script
#[tauri::command]
pub async fn frida_unload_script(
    frida: State<'_, FridaManager>,
    script_id: String,
) -> Result<(), String> {
    let sender = frida.inner().clone_sender();
    tauri::async_runtime::spawn_blocking(move || request_unload_script(&sender, script_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}

/// Detach a session
#[tauri::command]
pub async fn frida_detach(
    frida: State<'_, FridaManager>,
    session_id: String,
) -> Result<(), String> {
    let sender = frida.inner().clone_sender();
    tauri::async_runtime::spawn_blocking(move || request_detach(&sender, session_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?
}
