use rdev::{listen, EventType, Key};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

pub struct HotkeyEntry {
    pub keys: Vec<String>,
    pub id: String,
}

pub struct InputManager {
    hotkeys: Arc<Mutex<Vec<HotkeyEntry>>>,
    pressed_keys: Arc<Mutex<Vec<String>>>,
    listener_running: Mutex<bool>,
}

impl InputManager {
    pub fn new() -> Self {
        Self {
            hotkeys: Arc::new(Mutex::new(Vec::new())),
            pressed_keys: Arc::new(Mutex::new(Vec::new())),
            listener_running: Mutex::new(false),
        }
    }

    pub fn register_hotkey(&self, id: &str, keys: Vec<String>) {
        let mut hotkeys = self.hotkeys.lock().unwrap();
        hotkeys.push(HotkeyEntry {
            keys,
            id: id.to_string(),
        });
    }

    pub fn unregister_hotkey(&self, id: &str) {
        let mut hotkeys = self.hotkeys.lock().unwrap();
        hotkeys.retain(|h| h.id != id);
    }

    pub fn start_listener(&self, app_handle: AppHandle) {
        let mut running = self.listener_running.lock().unwrap();
        if *running {
            return;
        }
        *running = true;

        let hotkeys = self.hotkeys.clone();
        let pressed = self.pressed_keys.clone();

        thread::spawn(move || {
            listen(move |event| {
                match event.event_type {
                    EventType::KeyPress(key) => {
                        let key_name = format!("{:?}", key).to_lowercase();
                        let mut pressed_keys = pressed.lock().unwrap();
                        if !pressed_keys.contains(&key_name) {
                            pressed_keys.push(key_name);
                        }

                        let hotkeys = hotkeys.lock().unwrap();
                        for hotkey in hotkeys.iter() {
                            if hotkey.keys.iter().all(|k| pressed_keys.contains(k)) {
                                let _ = app_handle.emit(
                                    "input:hotkey-triggered",
                                    &serde_json::json!({ "id": hotkey.id }),
                                );
                            }
                        }
                    }
                    EventType::KeyRelease(key) => {
                        let key_name = format!("{:?}", key).to_lowercase();
                        let mut pressed_keys = pressed.lock().unwrap();
                        pressed_keys.retain(|k| k != &key_name);
                    }
                    _ => {}
                }
            })
            .expect("Failed to start input listener");
        });
    }
}
