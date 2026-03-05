use crate::preamble;
use crate::state::frida_state::{
    DeviceInfoData, FridaManager, FridaRequest, FridaResponse, FridaSender, ProcessInfoData,
    SpawnAttachData,
};
use crate::state::store_state::StoreManager;
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager, State};

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

fn request_spawn(frida: &FridaSender, device_id: String, program: String) -> Result<u32, String> {
    match frida.send(|reply| FridaRequest::Spawn {
        device_id,
        program,
        reply,
    }) {
        FridaResponse::Pid(r) => r,
        _ => Err("Unexpected response type".to_string()),
    }
}

fn request_spawn_attach(
    frida: &FridaSender,
    device_id: String,
    program: String,
    realm: Option<String>,
) -> Result<SpawnAttachData, String> {
    match frida.send(|reply| FridaRequest::SpawnAttach {
        device_id,
        program,
        realm,
        reply,
    }) {
        FridaResponse::SpawnAttach(r) => r,
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

fn request_attach(
    frida: &FridaSender,
    device_id: String,
    pid: u32,
    realm: Option<String>,
) -> Result<String, String> {
    match frida.send(|reply| FridaRequest::Attach {
        device_id,
        pid,
        realm,
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
    store_name: Option<String>,
) -> Result<String, String> {
    match frida.send(|reply| FridaRequest::LoadScript {
        session_id,
        code,
        store_name,
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

fn resolve_spawn_target(
    program: Option<String>,
    bundle_id: Option<String>,
) -> Result<String, String> {
    program
        .or(bundle_id)
        .ok_or_else(|| "Missing required spawn target: provide program (or bundleId)".to_string())
}

fn emit_devtools_frida_log(app: &AppHandle, level: &str, message: String) {
    let payload = serde_json::json!({
        "source": "frida",
        "level": level,
        "message": message,
    });
    let _ = app.emit("devtools:log", &payload);
}

fn resolve_script_file_path(app: &AppHandle, raw_path: &str) -> Result<PathBuf, String> {
    let input = PathBuf::from(raw_path);
    if input.is_absolute() {
        return Ok(input);
    }

    let mut candidates: Vec<PathBuf> = Vec::new();
    if let Ok(cwd) = std::env::current_dir() {
        candidates.push(cwd.join(&input));
        if let Some(parent) = cwd.parent() {
            candidates.push(parent.join(&input));
        }
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join(&input));
        if let Some(parent) = resource_dir.parent() {
            candidates.push(parent.join(&input));
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            candidates.push(exe_dir.join(&input));
            if let Some(parent) = exe_dir.parent() {
                candidates.push(parent.join(&input));
            }
        }
    }

    if let Some(found) = candidates.iter().find(|candidate| candidate.is_file()) {
        return Ok(found.clone());
    }

    let attempted = candidates
        .iter()
        .map(|candidate| candidate.display().to_string())
        .collect::<Vec<_>>()
        .join(", ");
    Err(format!(
        "Failed to resolve script file {}. Tried: {}",
        raw_path, attempted
    ))
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
    app: AppHandle,
    frida: State<'_, FridaManager>,
    device_id: String,
    program: Option<String>,
    bundle_id: Option<String>,
) -> Result<u32, String> {
    let target_program = resolve_spawn_target(program, bundle_id)?;
    let sender = frida.inner().clone_sender();
    let log_device_id = device_id.clone();
    let log_target_program = target_program.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        request_spawn(&sender, device_id, target_program)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    match &result {
        Ok(pid) => emit_devtools_frida_log(
            &app,
            "info",
            format!(
                "spawn succeeded device={} program={} pid={}",
                log_device_id, log_target_program, pid
            ),
        ),
        Err(err) => emit_devtools_frida_log(
            &app,
            "error",
            format!(
                "spawn failed device={} program={} error={}",
                log_device_id, log_target_program, err
            ),
        ),
    }

    result
}

/// Spawn and immediately attach on a device in one IPC round-trip.
#[tauri::command]
pub async fn frida_spawn_attach(
    app: AppHandle,
    frida: State<'_, FridaManager>,
    device_id: String,
    program: Option<String>,
    bundle_id: Option<String>,
    realm: Option<String>,
) -> Result<SpawnAttachData, String> {
    let target_program = resolve_spawn_target(program, bundle_id)?;
    let sender = frida.inner().clone_sender();
    let log_device_id = device_id.clone();
    let log_target_program = target_program.clone();
    let log_realm = realm.clone().unwrap_or_else(|| "native".to_string());
    let result = tauri::async_runtime::spawn_blocking(move || {
        request_spawn_attach(&sender, device_id, target_program, realm)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    match &result {
        Ok(data) => emit_devtools_frida_log(
            &app,
            "info",
            format!(
                "spawn_attach succeeded device={} program={} realm={} pid={} session={}",
                log_device_id, log_target_program, log_realm, data.pid, data.session_id
            ),
        ),
        Err(err) => emit_devtools_frida_log(
            &app,
            "error",
            format!(
                "spawn_attach failed device={} program={} realm={} error={}",
                log_device_id, log_target_program, log_realm, err
            ),
        ),
    }

    result
}

/// Resume a spawned process
#[tauri::command]
pub async fn frida_resume(
    app: AppHandle,
    frida: State<'_, FridaManager>,
    device_id: String,
    pid: u32,
) -> Result<(), String> {
    let sender = frida.inner().clone_sender();
    let log_device_id = device_id.clone();
    emit_devtools_frida_log(
        &app,
        "info",
        format!("resume requested device={} pid={}", log_device_id, pid),
    );

    let join_result =
        tauri::async_runtime::spawn_blocking(move || request_resume(&sender, device_id, pid)).await;
    let result = match join_result {
        Ok(result) => result,
        Err(e) => {
            let err = format!("Task join error: {}", e);
            emit_devtools_frida_log(
                &app,
                "error",
                format!(
                    "resume failed device={} pid={} error={}",
                    log_device_id, pid, err
                ),
            );
            return Err(err);
        }
    };

    match &result {
        Ok(()) => emit_devtools_frida_log(
            &app,
            "info",
            format!("resume succeeded device={} pid={}", log_device_id, pid),
        ),
        Err(err) => emit_devtools_frida_log(
            &app,
            "error",
            format!(
                "resume failed device={} pid={} error={}",
                log_device_id, pid, err
            ),
        ),
    }

    result
}

/// Attach to a process on a device
#[tauri::command]
pub async fn frida_attach(
    app: AppHandle,
    frida: State<'_, FridaManager>,
    device_id: String,
    pid: u32,
    realm: Option<String>,
) -> Result<String, String> {
    let sender = frida.inner().clone_sender();
    let log_device_id = device_id.clone();
    let log_realm = realm.clone().unwrap_or_else(|| "native".to_string());
    emit_devtools_frida_log(
        &app,
        "info",
        format!(
            "attach requested device={} pid={} realm={}",
            log_device_id, pid, log_realm
        ),
    );

    let join_result = tauri::async_runtime::spawn_blocking(move || {
        request_attach(&sender, device_id, pid, realm)
    })
    .await;
    let result = match join_result {
        Ok(result) => result,
        Err(e) => {
            let err = format!("Task join error: {}", e);
            emit_devtools_frida_log(
                &app,
                "error",
                format!(
                    "attach failed device={} pid={} realm={} error={}",
                    log_device_id, pid, log_realm, err
                ),
            );
            return Err(err);
        }
    };

    match &result {
        Ok(session_id) => emit_devtools_frida_log(
            &app,
            "info",
            format!(
                "attach succeeded device={} pid={} session={}",
                log_device_id, pid, session_id
            ),
        ),
        Err(err) => emit_devtools_frida_log(
            &app,
            "error",
            format!(
                "attach failed device={} pid={} realm={} error={}",
                log_device_id, pid, log_realm, err
            ),
        ),
    }

    result
}

/// Load a script into a session, with optional __<store_name>__ preamble
#[tauri::command]
pub async fn frida_load_script(
    app: AppHandle,
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
    let log_session_id = session_id.clone();
    let log_store_name = store_name.clone();
    emit_devtools_frida_log(
        &app,
        "info",
        format!(
            "load_script requested session={} store={}",
            log_session_id,
            log_store_name.as_deref().unwrap_or("-")
        ),
    );

    let join_result = tauri::async_runtime::spawn_blocking(move || {
        request_load_script(&sender, session_id, final_code, store_name)
    })
    .await;
    let result = match join_result {
        Ok(result) => result,
        Err(e) => {
            let err = format!("Task join error: {}", e);
            emit_devtools_frida_log(
                &app,
                "error",
                format!(
                    "load_script failed session={} store={} error={}",
                    log_session_id,
                    log_store_name.as_deref().unwrap_or("-"),
                    err
                ),
            );
            return Err(err);
        }
    };

    match &result {
        Ok(script_id) => emit_devtools_frida_log(
            &app,
            "info",
            format!(
                "load_script succeeded session={} script={} store={}",
                log_session_id,
                script_id,
                log_store_name.as_deref().unwrap_or("-")
            ),
        ),
        Err(err) => emit_devtools_frida_log(
            &app,
            "error",
            format!(
                "load_script failed session={} store={} error={}",
                log_session_id,
                log_store_name.as_deref().unwrap_or("-"),
                err
            ),
        ),
    }

    result
}

/// Load a script from a file path
#[tauri::command]
pub async fn frida_load_script_file(
    app: AppHandle,
    frida: State<'_, FridaManager>,
    store_manager: State<'_, StoreManager>,
    session_id: String,
    path: String,
    store_name: Option<String>,
) -> Result<String, String> {
    let log_session_id = session_id.clone();
    let log_store_name = store_name.clone();
    let log_path = path.clone();
    emit_devtools_frida_log(
        &app,
        "info",
        format!(
            "load_script_file requested session={} file={} store={}",
            log_session_id,
            log_path,
            log_store_name.as_deref().unwrap_or("-")
        ),
    );

    let resolved_path = match resolve_script_file_path(&app, &path) {
        Ok(found) => found,
        Err(err) => {
            emit_devtools_frida_log(
                &app,
                "error",
                format!(
                    "load_script_file failed session={} file={} store={} error={}",
                    log_session_id,
                    log_path,
                    log_store_name.as_deref().unwrap_or("-"),
                    err
                ),
            );
            return Err(err);
        }
    };

    emit_devtools_frida_log(
        &app,
        "debug",
        format!(
            "load_script_file resolved session={} file={} -> {}",
            log_session_id,
            log_path,
            resolved_path.display()
        ),
    );

    let code = match std::fs::read_to_string(&resolved_path) {
        Ok(code) => code,
        Err(e) => {
            let err = format!(
                "Failed to read script file {}: {}",
                resolved_path.display(),
                e
            );
            emit_devtools_frida_log(
                &app,
                "error",
                format!(
                    "load_script_file failed session={} file={} store={} error={}",
                    log_session_id,
                    log_path,
                    log_store_name.as_deref().unwrap_or("-"),
                    err
                ),
            );
            return Err(err);
        }
    };

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
    let join_result = tauri::async_runtime::spawn_blocking(move || {
        request_load_script(&sender, session_id, final_code, store_name)
    })
    .await;
    let result = match join_result {
        Ok(result) => result,
        Err(e) => {
            let err = format!("Task join error: {}", e);
            emit_devtools_frida_log(
                &app,
                "error",
                format!(
                    "load_script_file failed session={} file={} store={} error={}",
                    log_session_id,
                    log_path,
                    log_store_name.as_deref().unwrap_or("-"),
                    err
                ),
            );
            return Err(err);
        }
    };

    match &result {
        Ok(script_id) => emit_devtools_frida_log(
            &app,
            "info",
            format!(
                "load_script_file succeeded session={} script={} file={} store={}",
                log_session_id,
                script_id,
                log_path,
                log_store_name.as_deref().unwrap_or("-")
            ),
        ),
        Err(err) => emit_devtools_frida_log(
            &app,
            "error",
            format!(
                "load_script_file failed session={} file={} store={} error={}",
                log_session_id,
                log_path,
                log_store_name.as_deref().unwrap_or("-"),
                err
            ),
        ),
    }

    result
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
    app: AppHandle,
    frida: State<'_, FridaManager>,
    session_id: String,
) -> Result<(), String> {
    let sender = frida.inner().clone_sender();
    let detached_session_id = session_id.clone();
    let result = tauri::async_runtime::spawn_blocking(move || request_detach(&sender, session_id))
        .await
        .map_err(|e| format!("Task join error: {}", e))?;

    if result.is_ok() {
        let _ = app.emit(
            "frida:session-detached",
            &serde_json::json!({ "sessionId": detached_session_id }),
        );
    }
    result
}
