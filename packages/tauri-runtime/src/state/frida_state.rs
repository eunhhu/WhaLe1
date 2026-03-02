use serde::Serialize;
use std::collections::HashMap;
use std::sync::mpsc;

use tauri::AppHandle;

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

// ---------------------------------------------------------------------------
// Request / Response types for the worker channel
// ---------------------------------------------------------------------------

pub enum FridaResponse {
    Devices(Result<Vec<DeviceInfoData>, String>),
    Processes(Result<Vec<ProcessInfoData>, String>),
    Pid(Result<u32, String>),
    SessionId(Result<String, String>),
    ScriptId(Result<String, String>),
    Unit(Result<(), String>),
}

pub enum FridaRequest {
    ListDevices {
        reply: mpsc::Sender<FridaResponse>,
    },
    EnumerateProcesses {
        device_id: String,
        reply: mpsc::Sender<FridaResponse>,
    },
    Spawn {
        device_id: String,
        program: String,
        reply: mpsc::Sender<FridaResponse>,
    },
    Resume {
        device_id: String,
        pid: u32,
        reply: mpsc::Sender<FridaResponse>,
    },
    Attach {
        device_id: String,
        pid: u32,
        reply: mpsc::Sender<FridaResponse>,
    },
    LoadScript {
        session_id: String,
        code: String,
        reply: mpsc::Sender<FridaResponse>,
    },
    UnloadScript {
        script_id: String,
        reply: mpsc::Sender<FridaResponse>,
    },
    Detach {
        session_id: String,
        reply: mpsc::Sender<FridaResponse>,
    },
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
                log::info!(
                    "[whale:frida] script log [{}]: {}",
                    format!("{:?}", log_msg.level),
                    log_msg.payload
                );
            }
            frida::Message::Error(ref err_msg) => {
                log::info!(
                    "[whale:frida] script error: {} at {}:{}:{}",
                    err_msg.description,
                    err_msg.file_name,
                    err_msg.line_number,
                    err_msg.column_number
                );
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
    tx: mpsc::Sender<FridaRequest>,
}

// FridaManager only contains mpsc::Sender which is Send+Sync.
// The raw frida pointers live exclusively on the worker thread.
unsafe impl Send for FridaManager {}
unsafe impl Sync for FridaManager {}

impl FridaManager {
    /// Spawn the dedicated frida worker thread and return a handle.
    pub fn new(app: AppHandle) -> Self {
        let (tx, rx) = mpsc::channel::<FridaRequest>();

        std::thread::spawn(move || {
            log::info!("[whale:frida] worker thread started");

            // Initialize frida runtime on this thread
            let frida = unsafe { frida::Frida::obtain() };
            let device_manager = frida::DeviceManager::obtain(&frida);

            log::info!("[whale:frida] frida {} initialized", frida::Frida::version());

            // We store sessions and scripts using raw pointers because the
            // frida types carry lifetime parameters tied to their parent.
            // Since the frida instance, device_manager, and all derived
            // objects live for the entire duration of this thread, the
            // pointers remain valid. We box them and transmute to 'static.
            let mut sessions: HashMap<String, Box<frida::Session<'static>>> = HashMap::new();
            let mut scripts: HashMap<String, Box<frida::Script<'static>>> = HashMap::new();

            let mut session_counter: u64 = 0;
            let mut script_counter: u64 = 0;

            while let Ok(req) = rx.recv() {
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
                        log::info!("[whale:frida] listed {} devices", list.len());
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
                                log::info!(
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
                    } => {
                        match device_manager.get_device_by_id(&device_id) {
                            Ok(mut device) => {
                                let opts = frida::SpawnOptions::new();
                                match device.spawn(&program, &opts) {
                                    Ok(pid) => {
                                        log::info!(
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
                        }
                    }

                    FridaRequest::Resume {
                        device_id,
                        pid,
                        reply,
                    } => {
                        match device_manager.get_device_by_id(&device_id) {
                            Ok(device) => match device.resume(pid) {
                                Ok(()) => {
                                    log::info!(
                                        "[whale:frida] resumed pid {} on {}",
                                        pid,
                                        device_id
                                    );
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
                        }
                    }

                    FridaRequest::Attach {
                        device_id,
                        pid,
                        reply,
                    } => {
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
                                    log::info!(
                                        "[whale:frida] attached to pid {} -> {}",
                                        pid,
                                        sid
                                    );
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
                        reply,
                    } => {
                        if let Some(session) = sessions.get(&session_id) {
                            let mut opts = frida::ScriptOption::new();
                            match session.create_script(&code, &mut opts) {
                                Ok(mut script) => {
                                    // Set up message handler
                                    let handler = WhaleScriptHandler {
                                        app: app.clone(),
                                    };
                                    if let Err(e) = script.handle_message(handler) {
                                        let _ = reply.send(FridaResponse::ScriptId(Err(
                                            format!("Failed to set message handler: {}", e),
                                        )));
                                        continue;
                                    }

                                    // Load the script
                                    if let Err(e) = script.load() {
                                        let _ = reply.send(FridaResponse::ScriptId(Err(
                                            format!("Script load failed: {}", e),
                                        )));
                                        continue;
                                    }

                                    script_counter += 1;
                                    let scid = format!("script_{}", script_counter);
                                    // SAFETY: same lifetime reasoning as sessions
                                    let script_static: frida::Script<'static> =
                                        unsafe { std::mem::transmute(script) };
                                    scripts.insert(scid.clone(), Box::new(script_static));
                                    log::info!(
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

                    FridaRequest::UnloadScript { script_id, reply } => {
                        if let Some(script) = scripts.remove(&script_id) {
                            match script.unload() {
                                Ok(()) => {
                                    log::info!(
                                        "[whale:frida] unloaded script {}",
                                        script_id
                                    );
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
                        if let Some(session) = sessions.remove(&session_id) {
                            match session.detach() {
                                Ok(()) => {
                                    log::info!(
                                        "[whale:frida] detached session {}",
                                        session_id
                                    );
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

    /// Send a request to the worker thread and receive a reply.
    pub fn send(&self, req_fn: impl FnOnce(mpsc::Sender<FridaResponse>) -> FridaRequest) -> FridaResponse {
        let (reply_tx, reply_rx) = mpsc::channel();
        let request = req_fn(reply_tx);
        self.tx
            .send(request)
            .expect("[whale:frida] worker thread has terminated");
        reply_rx
            .recv()
            .expect("[whale:frida] worker thread dropped reply channel")
    }
}

// ---------------------------------------------------------------------------
// FridaSender — lightweight cloneable handle for async commands
// ---------------------------------------------------------------------------

pub struct FridaSender {
    tx: mpsc::Sender<FridaRequest>,
}

impl FridaSender {
    /// Send a request to the worker thread and receive a reply.
    pub fn send(&self, req_fn: impl FnOnce(mpsc::Sender<FridaResponse>) -> FridaRequest) -> FridaResponse {
        let (reply_tx, reply_rx) = mpsc::channel();
        let request = req_fn(reply_tx);
        self.tx
            .send(request)
            .expect("[whale:frida] worker thread has terminated");
        reply_rx
            .recv()
            .expect("[whale:frida] worker thread dropped reply channel")
    }
}
