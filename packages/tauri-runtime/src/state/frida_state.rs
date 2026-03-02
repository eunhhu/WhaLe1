use std::collections::HashMap;
use std::sync::Mutex;

/// FridaManager — frida-rust를 래핑하여 디바이스/세션/스크립트 관리
///
/// NOTE: frida-rust crate는 시스템에 Frida devkit이 설치되어야 컴파일됨.
/// 따라서 frida-rust는 feature flag로 분리하고, 여기서는 Tauri IPC 인터페이스만 정의.
/// 실제 frida-rust 바인딩은 사용자 환경에서 feature flag 활성화 시 사용.

pub struct FridaManager {
    sessions: Mutex<HashMap<String, SessionInfo>>,
    scripts: Mutex<HashMap<String, ScriptInfo>>,
}

pub struct SessionInfo {
    pub id: String,
    pub device_id: String,
    pub pid: u32,
}

pub struct ScriptInfo {
    pub id: String,
    pub session_id: String,
}

impl FridaManager {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
            scripts: Mutex::new(HashMap::new()),
        }
    }

    pub fn add_session(&self, id: &str, device_id: &str, pid: u32) {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.insert(
            id.to_string(),
            SessionInfo {
                id: id.to_string(),
                device_id: device_id.to_string(),
                pid,
            },
        );
    }

    pub fn remove_session(&self, id: &str) {
        let mut sessions = self.sessions.lock().unwrap();
        sessions.remove(id);
    }

    pub fn add_script(&self, id: &str, session_id: &str) {
        let mut scripts = self.scripts.lock().unwrap();
        scripts.insert(
            id.to_string(),
            ScriptInfo {
                id: id.to_string(),
                session_id: session_id.to_string(),
            },
        );
    }
}
