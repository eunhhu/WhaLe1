use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;
use std::time::Duration;

use crossbeam_channel as channel;
use tauri::{AppHandle, Emitter};

// ---------------------------------------------------------------------------
// Data types returned to the frontend
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct DeviceInfoData {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfoData {
    pub pid: u32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SpawnAttachData {
    #[serde(rename = "sessionId")]
    pub session_id: String,
    pub pid: u32,
}

// ---------------------------------------------------------------------------
// Request / Response types for the worker channel
// ---------------------------------------------------------------------------

pub enum FridaResponse {
    Devices(Result<Vec<DeviceInfoData>, String>),
    Processes(Result<Vec<ProcessInfoData>, String>),
    Pid(Result<u32, String>),
    SpawnAttach(Result<SpawnAttachData, String>),
    SessionId(Result<String, String>),
    ScriptId(Result<String, String>),
    Unit(Result<(), String>),
}

pub enum FridaRequest {
    ListDevices {
        reply: channel::Sender<FridaResponse>,
    },
    EnumerateProcesses {
        device_id: String,
        reply: channel::Sender<FridaResponse>,
    },
    Spawn {
        device_id: String,
        program: String,
        reply: channel::Sender<FridaResponse>,
    },
    SpawnAttach {
        device_id: String,
        program: String,
        realm: Option<String>,
        reply: channel::Sender<FridaResponse>,
    },
    Resume {
        device_id: String,
        pid: u32,
        reply: channel::Sender<FridaResponse>,
    },
    Attach {
        device_id: String,
        pid: u32,
        realm: Option<String>,
        reply: channel::Sender<FridaResponse>,
    },
    LoadScript {
        session_id: String,
        code: String,
        store_name: Option<String>,
        reply: channel::Sender<FridaResponse>,
    },
    UpdateStore {
        store_name: String,
        patch: HashMap<String, serde_json::Value>,
        reply: channel::Sender<FridaResponse>,
    },
    UnloadScript {
        script_id: String,
        reply: channel::Sender<FridaResponse>,
    },
    Detach {
        session_id: String,
        reply: channel::Sender<FridaResponse>,
    },
}

fn env_flag_enabled(name: &str, default_enabled: bool) -> bool {
    match std::env::var(name) {
        Ok(v) => !matches!(
            v.to_ascii_lowercase().as_str(),
            "0" | "false" | "no" | "off"
        ),
        Err(_) => default_enabled,
    }
}

fn devtools_frida_log_stream_enabled() -> bool {
    static ENABLED: OnceLock<bool> = OnceLock::new();
    *ENABLED.get_or_init(|| env_flag_enabled("WHALE_DEVTOOLS_FRIDA_LOG", true))
}

fn emit_devtools_frida_log(app: &AppHandle, level: &str, message: String) {
    let payload = serde_json::json!({
        "source": "frida",
        "level": level,
        "message": message,
    });
    let _ = app.emit("devtools:log", &payload);
}

fn unload_session_scripts(
    session_id: &str,
    scripts: &mut HashMap<String, Box<frida::Script<'static>>>,
    script_sessions: &mut HashMap<String, String>,
    session_scripts: &mut HashMap<String, HashSet<String>>,
    script_stores: &mut HashMap<String, String>,
    store_scripts: &mut HashMap<String, HashSet<String>>,
) {
    if let Some(script_ids) = session_scripts.remove(session_id) {
        for script_id in script_ids {
            script_sessions.remove(&script_id);
            if let Some(store_name) = script_stores.remove(&script_id) {
                let mut remove_entry = false;
                if let Some(ids) = store_scripts.get_mut(&store_name) {
                    ids.remove(&script_id);
                    remove_entry = ids.is_empty();
                }
                if remove_entry {
                    store_scripts.remove(&store_name);
                }
            }
            if let Some(script) = scripts.remove(&script_id) {
                if let Err(e) = script.unload() {
                    log::warn!(
                        "[whale:frida] failed to unload script {} for session {}: {}",
                        script_id,
                        session_id,
                        e
                    );
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// ScriptHandler implementation — forwards messages to bridge
// ---------------------------------------------------------------------------

struct WhaleScriptHandler {
    app: AppHandle,
}

impl frida::ScriptHandler for WhaleScriptHandler {
    fn on_message(&mut self, message: frida::Message, _data: Option<Vec<u8>>) {
        match message {
            frida::Message::Send(ref send_msg) => {
                // SendPayload has structured fields; convert returns to Value
                // and pass to bridge
                let payload = serde_json::json!({
                    "type": send_msg.payload.r#type,
                    "id": send_msg.payload.id,
                    "result": send_msg.payload.result,
                    "returns": send_msg.payload.returns,
                });
                crate::bridge::handle_frida_message(&self.app, &payload);
            }
            frida::Message::Log(ref log_msg) => {
                log::debug!(
                    "[whale:frida] script log [{}]: {}",
                    format!("{:?}", log_msg.level),
                    log_msg.payload
                );
                if cfg!(debug_assertions) && devtools_frida_log_stream_enabled() {
                    emit_devtools_frida_log(
                        &self.app,
                        &format!("{:?}", log_msg.level).to_lowercase(),
                        log_msg.payload.clone(),
                    );
                }
            }
            frida::Message::Error(ref err_msg) => {
                log::warn!(
                    "[whale:frida] script error: {} at {}:{}:{}",
                    err_msg.description,
                    err_msg.file_name,
                    err_msg.line_number,
                    err_msg.column_number
                );
                if cfg!(debug_assertions) && devtools_frida_log_stream_enabled() {
                    emit_devtools_frida_log(
                        &self.app,
                        "error",
                        format!(
                            "{} at {}:{}:{}",
                            err_msg.description,
                            err_msg.file_name,
                            err_msg.line_number,
                            err_msg.column_number
                        ),
                    );
                }
            }
            frida::Message::Other(ref val) => {
                // Whale's send({__whale: true, ...}) arrives here when the
                // payload doesn't match the strict SendPayload struct.
                // The raw frida message is {"type":"send","payload":{...}}.
                if let Some(payload) = val.get("payload") {
                    crate::bridge::handle_frida_message(&self.app, payload);
                } else {
                    crate::bridge::handle_frida_message(&self.app, val);
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// DeviceType -> string helper
// ---------------------------------------------------------------------------

fn device_type_str(dt: frida::DeviceType) -> &'static str {
    match dt {
        frida::DeviceType::Local => "local",
        frida::DeviceType::Remote => "remote",
        frida::DeviceType::USB => "usb",
        _ => "unknown",
    }
}

// ---------------------------------------------------------------------------
// FridaManager — holds only a Sender; the worker thread owns all frida objects
// ---------------------------------------------------------------------------

pub struct FridaManager {
    tx: channel::Sender<FridaRequest>,
}

impl FridaManager {
    /// Spawn the dedicated frida worker thread and return a handle.
    pub fn new(app: AppHandle) -> Self {
        let (tx, rx) = channel::unbounded::<FridaRequest>();

        std::thread::spawn(move || {
            log::info!("[whale:frida] worker thread started");

            // Initialize frida runtime on this thread
            let frida = unsafe { frida::Frida::obtain() };
            let device_manager = frida::DeviceManager::obtain(&frida);

            log::info!(
                "[whale:frida] frida {} initialized",
                frida::Frida::version()
            );

            // We store sessions and scripts using raw pointers because the
            // frida types carry lifetime parameters tied to their parent.
            // Since the frida instance, device_manager, and all derived
            // objects live for the entire duration of this thread, the
            // pointers remain valid. We box them and transmute to 'static.
            let mut sessions: HashMap<String, Box<frida::Session<'static>>> = HashMap::new();
            let mut scripts: HashMap<String, Box<frida::Script<'static>>> = HashMap::new();
            // Track ownership to safely unload scripts before a session is detached.
            let mut script_sessions: HashMap<String, String> = HashMap::new();
            let mut session_scripts: HashMap<String, HashSet<String>> = HashMap::new();
            // Track store-bound scripts so store updates can be pushed to recv('config').
            let mut script_stores: HashMap<String, String> = HashMap::new();
            let mut store_scripts: HashMap<String, HashSet<String>> = HashMap::new();

            let mut session_counter: u64 = 0;
            let mut script_counter: u64 = 0;

            loop {
                let req = match rx.recv_timeout(Duration::from_millis(250)) {
                    Ok(req) => req,
                    Err(channel::RecvTimeoutError::Timeout) => {
                        let detached_sessions: Vec<String> = sessions
                            .iter()
                            .filter_map(|(session_id, session)| {
                                if session.is_detached() {
                                    Some(session_id.clone())
                                } else {
                                    None
                                }
                            })
                            .collect();

                        for session_id in detached_sessions {
                            unload_session_scripts(
                                &session_id,
                                &mut scripts,
                                &mut script_sessions,
                                &mut session_scripts,
                                &mut script_stores,
                                &mut store_scripts,
                            );
                            if sessions.remove(&session_id).is_some() {
                                let _ = app.emit(
                                    "frida:session-detached",
                                    &serde_json::json!({ "sessionId": session_id }),
                                );
                            }
                        }

                        continue;
                    }
                    Err(channel::RecvTimeoutError::Disconnected) => break,
                };

                match req {
                    FridaRequest::ListDevices { reply } => {
                        let devices = device_manager.enumerate_all_devices();
                        let list: Vec<DeviceInfoData> = devices
                            .iter()
                            .map(|d| DeviceInfoData {
                                id: d.get_id().to_string(),
                                name: d.get_name().to_string(),
                                kind: device_type_str(d.get_type()).to_string(),
                            })
                            .collect();
                        log::debug!("[whale:frida] listed {} devices", list.len());
                        let _ = reply.send(FridaResponse::Devices(Ok(list)));
                    }

                    FridaRequest::EnumerateProcesses { device_id, reply } => {
                        match device_manager.get_device_by_id(&device_id) {
                            Ok(device) => {
                                let procs = device.enumerate_processes();
                                let list: Vec<ProcessInfoData> = procs
                                    .iter()
                                    .map(|p| ProcessInfoData {
                                        pid: p.get_pid(),
                                        name: p.get_name().to_string(),
                                    })
                                    .collect();
                                log::debug!(
                                    "[whale:frida] enumerated {} processes on device {}",
                                    list.len(),
                                    device_id
                                );
                                let _ = reply.send(FridaResponse::Processes(Ok(list)));
                            }
                            Err(e) => {
                                let _ = reply.send(FridaResponse::Processes(Err(format!(
                                    "Device lookup failed ({}): {}",
                                    device_id, e
                                ))));
                            }
                        }
                    }

                    FridaRequest::Spawn {
                        device_id,
                        program,
                        reply,
                    } => match device_manager.get_device_by_id(&device_id) {
                        Ok(mut device) => {
                            let opts = frida::SpawnOptions::new();
                            match device.spawn(&program, &opts) {
                                Ok(pid) => {
                                    log::debug!(
                                        "[whale:frida] spawned {} on {} -> pid {}",
                                        program,
                                        device_id,
                                        pid
                                    );
                                    let _ = reply.send(FridaResponse::Pid(Ok(pid)));
                                }
                                Err(e) => {
                                    let _ = reply.send(FridaResponse::Pid(Err(format!(
                                        "Spawn failed: {}",
                                        e
                                    ))));
                                }
                            }
                        }
                        Err(e) => {
                            let _ = reply.send(FridaResponse::Pid(Err(format!(
                                "Device lookup failed ({}): {}",
                                device_id, e
                            ))));
                        }
                    },

                    FridaRequest::SpawnAttach {
                        device_id,
                        program,
                        realm,
                        reply,
                    } => {
                        let normalized_realm = realm
                            .as_deref()
                            .map(str::trim)
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_ascii_lowercase());
                        if matches!(normalized_realm.as_deref(), Some("emulated")) {
                            let _ = reply.send(FridaResponse::SpawnAttach(Err(
                                "SpawnAttach realm \"emulated\" is not supported by this runtime yet. Use \"native\" or omit realm.".to_string(),
                            )));
                            continue;
                        }
                        if let Some(other) = normalized_realm.as_deref() {
                            if other != "native" {
                                let _ = reply.send(FridaResponse::SpawnAttach(Err(format!(
                                    "Invalid spawn_attach realm: {} (expected \"native\" or \"emulated\")",
                                    other
                                ))));
                                continue;
                            }
                        }
                        match device_manager.get_device_by_id(&device_id) {
                            Ok(mut device) => {
                                let opts = frida::SpawnOptions::new();
                                match device.spawn(&program, &opts) {
                                    Ok(pid) => match device.attach(pid) {
                                        Ok(session) => {
                                            session_counter += 1;
                                            let sid = format!(
                                                "session_{}_{}",
                                                device_id, session_counter
                                            );
                                            // SAFETY: session is derived from device which is derived
                                            // from device_manager which lives for the thread lifetime.
                                            let session_static: frida::Session<'static> =
                                                unsafe { std::mem::transmute(session) };
                                            sessions.insert(sid.clone(), Box::new(session_static));
                                            log::debug!(
                                                "[whale:frida] spawned+attached {} on {} -> {} ({})",
                                                program,
                                                device_id,
                                                sid,
                                                pid
                                            );
                                            let _ = reply.send(FridaResponse::SpawnAttach(Ok(
                                                SpawnAttachData {
                                                    session_id: sid,
                                                    pid,
                                                },
                                            )));
                                        }
                                        Err(e) => {
                                            let _ = reply.send(FridaResponse::SpawnAttach(Err(
                                                format!("Attach after spawn failed: {}", e),
                                            )));
                                        }
                                    },
                                    Err(e) => {
                                        let _ = reply.send(FridaResponse::SpawnAttach(Err(
                                            format!("Spawn failed: {}", e),
                                        )));
                                    }
                                }
                            }
                            Err(e) => {
                                let _ = reply.send(FridaResponse::SpawnAttach(Err(format!(
                                    "Device lookup failed ({}): {}",
                                    device_id, e
                                ))));
                            }
                        }
                    }

                    FridaRequest::Resume {
                        device_id,
                        pid,
                        reply,
                    } => match device_manager.get_device_by_id(&device_id) {
                        Ok(device) => match device.resume(pid) {
                            Ok(()) => {
                                log::debug!("[whale:frida] resumed pid {} on {}", pid, device_id);
                                let _ = reply.send(FridaResponse::Unit(Ok(())));
                            }
                            Err(e) => {
                                let _ = reply.send(FridaResponse::Unit(Err(format!(
                                    "Resume failed: {}",
                                    e
                                ))));
                            }
                        },
                        Err(e) => {
                            let _ = reply.send(FridaResponse::Unit(Err(format!(
                                "Device lookup failed ({}): {}",
                                device_id, e
                            ))));
                        }
                    },

                    FridaRequest::Attach {
                        device_id,
                        pid,
                        realm,
                        reply,
                    } => {
                        let normalized_realm = realm
                            .as_deref()
                            .map(str::trim)
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_ascii_lowercase());
                        if matches!(normalized_realm.as_deref(), Some("emulated")) {
                            let _ = reply.send(FridaResponse::SessionId(Err(
                                "Attach realm \"emulated\" is not supported by this runtime yet. Use \"native\" or omit realm.".to_string(),
                            )));
                            continue;
                        }
                        if let Some(other) = normalized_realm.as_deref() {
                            if other != "native" {
                                let _ = reply.send(FridaResponse::SessionId(Err(format!(
                                    "Invalid attach realm: {} (expected \"native\" or \"emulated\")",
                                    other
                                ))));
                                continue;
                            }
                        }
                        match device_manager.get_device_by_id(&device_id) {
                            Ok(device) => match device.attach(pid) {
                                Ok(session) => {
                                    session_counter += 1;
                                    let sid = format!("session_{}_{}", device_id, session_counter);
                                    // SAFETY: session is derived from device which is derived
                                    // from device_manager which lives for the thread lifetime.
                                    // We transmute the lifetime to 'static to store in HashMap.
                                    let session_static: frida::Session<'static> =
                                        unsafe { std::mem::transmute(session) };
                                    sessions.insert(sid.clone(), Box::new(session_static));
                                    log::debug!("[whale:frida] attached to pid {} -> {}", pid, sid);
                                    let _ = reply.send(FridaResponse::SessionId(Ok(sid)));
                                }
                                Err(e) => {
                                    let _ = reply.send(FridaResponse::SessionId(Err(format!(
                                        "Attach failed: {}",
                                        e
                                    ))));
                                }
                            },
                            Err(e) => {
                                let _ = reply.send(FridaResponse::SessionId(Err(format!(
                                    "Device lookup failed ({}): {}",
                                    device_id, e
                                ))));
                            }
                        }
                    }

                    FridaRequest::LoadScript {
                        session_id,
                        code,
                        store_name,
                        reply,
                    } => {
                        if let Some(session) = sessions.get(&session_id) {
                            let mut opts = frida::ScriptOption::new();
                            match session.create_script(&code, &mut opts) {
                                Ok(mut script) => {
                                    // Set up message handler
                                    let handler = WhaleScriptHandler { app: app.clone() };
                                    if let Err(e) = script.handle_message(handler) {
                                        let _ = reply.send(FridaResponse::ScriptId(Err(format!(
                                            "Failed to set message handler: {}",
                                            e
                                        ))));
                                        continue;
                                    }

                                    // Load the script
                                    if let Err(e) = script.load() {
                                        let _ = reply.send(FridaResponse::ScriptId(Err(format!(
                                            "Script load failed: {}",
                                            e
                                        ))));
                                        continue;
                                    }

                                    script_counter += 1;
                                    let scid = format!("script_{}", script_counter);
                                    // SAFETY: same lifetime reasoning as sessions
                                    let script_static: frida::Script<'static> =
                                        unsafe { std::mem::transmute(script) };
                                    scripts.insert(scid.clone(), Box::new(script_static));
                                    script_sessions.insert(scid.clone(), session_id.clone());
                                    session_scripts
                                        .entry(session_id.clone())
                                        .or_default()
                                        .insert(scid.clone());
                                    if let Some(name) = store_name {
                                        script_stores.insert(scid.clone(), name.clone());
                                        store_scripts.entry(name).or_default().insert(scid.clone());
                                    }
                                    log::debug!(
                                        "[whale:frida] loaded script {} in {}",
                                        scid,
                                        session_id
                                    );
                                    let _ = reply.send(FridaResponse::ScriptId(Ok(scid)));
                                }
                                Err(e) => {
                                    let _ = reply.send(FridaResponse::ScriptId(Err(format!(
                                        "Script creation failed: {}",
                                        e
                                    ))));
                                }
                            }
                        } else {
                            let _ = reply.send(FridaResponse::ScriptId(Err(format!(
                                "Session not found: {}",
                                session_id
                            ))));
                        }
                    }

                    FridaRequest::UpdateStore {
                        store_name,
                        patch,
                        reply,
                    } => {
                        let script_ids =
                            store_scripts.get(&store_name).cloned().unwrap_or_default();
                        if script_ids.is_empty() {
                            let _ = reply.send(FridaResponse::Unit(Ok(())));
                            continue;
                        }

                        let message = serde_json::json!({
                            "type": "config",
                            "payload": patch,
                        })
                        .to_string();

                        let mut failed = Vec::new();
                        for script_id in script_ids {
                            match scripts.get(&script_id) {
                                Some(script) => {
                                    if let Err(err) = script.post(&message, None) {
                                        failed.push(format!("{} ({})", script_id, err));
                                    }
                                }
                                None => {
                                    failed.push(format!("{} (not found)", script_id));
                                }
                            }
                        }

                        if failed.is_empty() {
                            let _ = reply.send(FridaResponse::Unit(Ok(())));
                        } else {
                            let _ = reply.send(FridaResponse::Unit(Err(format!(
                                "Failed to update {} script(s): {}",
                                failed.len(),
                                failed.join(", ")
                            ))));
                        }
                    }

                    FridaRequest::UnloadScript { script_id, reply } => {
                        if let Some(script) = scripts.remove(&script_id) {
                            if let Some(store_name) = script_stores.remove(&script_id) {
                                let mut remove_entry = false;
                                if let Some(ids) = store_scripts.get_mut(&store_name) {
                                    ids.remove(&script_id);
                                    remove_entry = ids.is_empty();
                                }
                                if remove_entry {
                                    store_scripts.remove(&store_name);
                                }
                            }
                            if let Some(session_id) = script_sessions.remove(&script_id) {
                                let mut remove_entry = false;
                                if let Some(ids) = session_scripts.get_mut(&session_id) {
                                    ids.remove(&script_id);
                                    remove_entry = ids.is_empty();
                                }
                                if remove_entry {
                                    session_scripts.remove(&session_id);
                                }
                            }
                            match script.unload() {
                                Ok(()) => {
                                    log::debug!("[whale:frida] unloaded script {}", script_id);
                                    let _ = reply.send(FridaResponse::Unit(Ok(())));
                                }
                                Err(e) => {
                                    let _ = reply.send(FridaResponse::Unit(Err(format!(
                                        "Unload failed: {}",
                                        e
                                    ))));
                                }
                            }
                        } else {
                            let _ = reply.send(FridaResponse::Unit(Err(format!(
                                "Script not found: {}",
                                script_id
                            ))));
                        }
                    }

                    FridaRequest::Detach { session_id, reply } => {
                        unload_session_scripts(
                            &session_id,
                            &mut scripts,
                            &mut script_sessions,
                            &mut session_scripts,
                            &mut script_stores,
                            &mut store_scripts,
                        );

                        if let Some(session) = sessions.get(&session_id) {
                            match session.detach() {
                                Ok(()) => {
                                    sessions.remove(&session_id);
                                    log::debug!("[whale:frida] detached session {}", session_id);
                                    let _ = reply.send(FridaResponse::Unit(Ok(())));
                                }
                                Err(e) => {
                                    let _ = reply.send(FridaResponse::Unit(Err(format!(
                                        "Detach failed: {}",
                                        e
                                    ))));
                                }
                            }
                        } else {
                            let _ = reply.send(FridaResponse::Unit(Err(format!(
                                "Session not found: {}",
                                session_id
                            ))));
                        }
                    }
                }
            }

            log::info!("[whale:frida] worker thread shutting down");
            // sessions, scripts, device_manager, frida drop here in order
            drop(scripts);
            drop(script_sessions);
            drop(session_scripts);
            drop(script_stores);
            drop(store_scripts);
            drop(sessions);
        });

        Self { tx }
    }

    /// Create a lightweight cloneable handle for use in spawn_blocking.
    pub fn clone_sender(&self) -> FridaSender {
        FridaSender {
            tx: self.tx.clone(),
        }
    }
}

// ---------------------------------------------------------------------------
// FridaSender — lightweight cloneable handle for async commands
// ---------------------------------------------------------------------------

pub struct FridaSender {
    tx: channel::Sender<FridaRequest>,
}

impl FridaSender {
    /// Send a request to the worker thread and receive a reply.
    pub fn send(
        &self,
        req_fn: impl FnOnce(channel::Sender<FridaResponse>) -> FridaRequest,
    ) -> FridaResponse {
        let (reply_tx, reply_rx) = channel::bounded(1);
        let request = req_fn(reply_tx);
        self.tx
            .send(request)
            .expect("[whale:frida] worker thread has terminated");
        reply_rx
            .recv()
            .expect("[whale:frida] worker thread dropped reply channel")
    }
}
