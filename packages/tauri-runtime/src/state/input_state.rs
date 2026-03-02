use rdev::{listen, EventType, Key};
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
        let normalized_keys = keys
            .into_iter()
            .map(|key| normalize_hotkey_key(&key))
            .collect();
        hotkeys.push(HotkeyEntry {
            keys: normalized_keys,
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
                        let key_name = key_to_hotkey_name(key);
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
                        let key_name = key_to_hotkey_name(key);
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

fn normalize_hotkey_key(key: &str) -> String {
    match key.to_lowercase().as_str() {
        "control" | "ctrl" | "controlleft" | "controlright" => "ctrl".to_string(),
        "shift" | "shiftleft" | "shiftright" => "shift".to_string(),
        "alt" | "altleft" | "altright" | "altgr" => "alt".to_string(),
        "meta" | "metaleft" | "metaright" | "super" | "cmd" | "command" => {
            "meta".to_string()
        }
        "return" => "enter".to_string(),
        "esc" => "escape".to_string(),
        other => other.to_string(),
    }
}

fn key_to_hotkey_name(key: Key) -> String {
    match key {
        Key::KeyA => "a",
        Key::KeyB => "b",
        Key::KeyC => "c",
        Key::KeyD => "d",
        Key::KeyE => "e",
        Key::KeyF => "f",
        Key::KeyG => "g",
        Key::KeyH => "h",
        Key::KeyI => "i",
        Key::KeyJ => "j",
        Key::KeyK => "k",
        Key::KeyL => "l",
        Key::KeyM => "m",
        Key::KeyN => "n",
        Key::KeyO => "o",
        Key::KeyP => "p",
        Key::KeyQ => "q",
        Key::KeyR => "r",
        Key::KeyS => "s",
        Key::KeyT => "t",
        Key::KeyU => "u",
        Key::KeyV => "v",
        Key::KeyW => "w",
        Key::KeyX => "x",
        Key::KeyY => "y",
        Key::KeyZ => "z",
        Key::Num0 => "0",
        Key::Num1 => "1",
        Key::Num2 => "2",
        Key::Num3 => "3",
        Key::Num4 => "4",
        Key::Num5 => "5",
        Key::Num6 => "6",
        Key::Num7 => "7",
        Key::Num8 => "8",
        Key::Num9 => "9",
        Key::F1 => "f1",
        Key::F2 => "f2",
        Key::F3 => "f3",
        Key::F4 => "f4",
        Key::F5 => "f5",
        Key::F6 => "f6",
        Key::F7 => "f7",
        Key::F8 => "f8",
        Key::F9 => "f9",
        Key::F10 => "f10",
        Key::F11 => "f11",
        Key::F12 => "f12",
        Key::Escape => "escape",
        Key::Return => "enter",
        Key::Space => "space",
        Key::Tab => "tab",
        Key::Backspace => "backspace",
        Key::Delete => "delete",
        Key::UpArrow => "up",
        Key::DownArrow => "down",
        Key::LeftArrow => "left",
        Key::RightArrow => "right",
        Key::Home => "home",
        Key::End => "end",
        Key::PageUp => "pageup",
        Key::PageDown => "pagedown",
        Key::ShiftLeft | Key::ShiftRight => "shift",
        Key::ControlLeft | Key::ControlRight => "ctrl",
        Key::Alt | Key::AltGr => "alt",
        Key::MetaLeft | Key::MetaRight => "meta",
        _ => return normalize_hotkey_key(&format!("{:?}", key).to_lowercase()),
    }
    .to_string()
}
