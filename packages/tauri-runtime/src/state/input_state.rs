use rdev::{listen, EventType, Key};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::thread;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Debug)]
pub struct HotkeyEntry {
    pub keys: Vec<String>,
    pub id: String,
}

#[derive(Default)]
struct HotkeyTransitions {
    pressed: Vec<String>,
    released: Vec<String>,
}

pub struct InputManager {
    hotkeys: Arc<Mutex<Vec<HotkeyEntry>>>,
    pressed_keys: Arc<Mutex<HashSet<String>>>,
    active_hotkeys: Arc<Mutex<HashSet<String>>>,
    listener_running: Mutex<bool>,
}

impl InputManager {
    pub fn new() -> Self {
        Self {
            hotkeys: Arc::new(Mutex::new(Vec::new())),
            pressed_keys: Arc::new(Mutex::new(HashSet::new())),
            active_hotkeys: Arc::new(Mutex::new(HashSet::new())),
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
        drop(hotkeys);

        let mut active_hotkeys = self.active_hotkeys.lock().unwrap();
        active_hotkeys.remove(id);
    }

    pub fn start_listener(&self, app_handle: AppHandle) {
        let mut running = self.listener_running.lock().unwrap();
        if *running {
            return;
        }
        *running = true;

        let hotkeys = self.hotkeys.clone();
        let pressed = self.pressed_keys.clone();
        let active = self.active_hotkeys.clone();

        thread::spawn(move || {
            listen(move |event| {
                let (key_name, is_press) = match event.event_type {
                    EventType::KeyPress(key) => (key_to_hotkey_name(key), true),
                    EventType::KeyRelease(key) => (key_to_hotkey_name(key), false),
                    _ => return,
                };

                let transitions = {
                    let hotkeys_guard = hotkeys.lock().unwrap();
                    let mut pressed_guard = pressed.lock().unwrap();
                    let mut active_guard = active.lock().unwrap();
                    apply_hotkey_event(
                        &hotkeys_guard,
                        &mut pressed_guard,
                        &mut active_guard,
                        key_name,
                        is_press,
                    )
                };

                for id in transitions.pressed {
                    let _ = app_handle.emit(
                        "input:hotkey-triggered",
                        &serde_json::json!({ "id": id, "phase": "press" }),
                    );
                }
                for id in transitions.released {
                    let _ = app_handle.emit(
                        "input:hotkey-triggered",
                        &serde_json::json!({ "id": id, "phase": "release" }),
                    );
                }
            })
            .expect("Failed to start input listener");
        });
    }
}

fn apply_hotkey_event(
    hotkeys: &[HotkeyEntry],
    pressed_keys: &mut HashSet<String>,
    active_hotkeys: &mut HashSet<String>,
    key_name: String,
    is_press: bool,
) -> HotkeyTransitions {
    if is_press {
        // Ignore duplicated/spurious key press events while the key is already held.
        if !pressed_keys.insert(key_name) {
            return HotkeyTransitions::default();
        }
    } else {
        pressed_keys.remove(&key_name);
    }

    let registered_ids: HashSet<&str> = hotkeys.iter().map(|h| h.id.as_str()).collect();
    active_hotkeys.retain(|id| registered_ids.contains(id.as_str()));

    let mut transitions = HotkeyTransitions::default();
    for hotkey in hotkeys {
        let matched = hotkey.keys.iter().all(|k| pressed_keys.contains(k));
        if matched {
            if active_hotkeys.insert(hotkey.id.clone()) {
                transitions.pressed.push(hotkey.id.clone());
            }
        } else {
            if active_hotkeys.remove(&hotkey.id) {
                transitions.released.push(hotkey.id.clone());
            }
        }
    }
    transitions
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

#[cfg(test)]
mod tests {
    use super::*;

    fn hk(id: &str, keys: &[&str]) -> HotkeyEntry {
        HotkeyEntry {
            id: id.to_string(),
            keys: keys.iter().map(|k| k.to_string()).collect(),
        }
    }

    #[test]
    fn test_duplicate_keypress_does_not_retrigger() {
        let hotkeys = vec![hk("a_only", &["a"])];
        let mut pressed = HashSet::new();
        let mut active = HashSet::new();

        let first = apply_hotkey_event(&hotkeys, &mut pressed, &mut active, "a".to_string(), true);
        let second = apply_hotkey_event(&hotkeys, &mut pressed, &mut active, "a".to_string(), true);

        assert_eq!(first.pressed, vec!["a_only".to_string()]);
        assert!(first.released.is_empty());
        assert!(second.pressed.is_empty());
        assert!(second.released.is_empty());
    }

    #[test]
    fn test_combo_triggers_once_per_activation() {
        let hotkeys = vec![hk("combo", &["ctrl", "f1"])];
        let mut pressed = HashSet::new();
        let mut active = HashSet::new();

        let t1 = apply_hotkey_event(&hotkeys, &mut pressed, &mut active, "ctrl".to_string(), true);
        let t2 = apply_hotkey_event(&hotkeys, &mut pressed, &mut active, "f1".to_string(), true);
        let t3 = apply_hotkey_event(&hotkeys, &mut pressed, &mut active, "f1".to_string(), true);
        let t4 = apply_hotkey_event(&hotkeys, &mut pressed, &mut active, "f1".to_string(), false);
        let t5 = apply_hotkey_event(&hotkeys, &mut pressed, &mut active, "f1".to_string(), true);

        assert!(t1.pressed.is_empty());
        assert!(t1.released.is_empty());
        assert_eq!(t2.pressed, vec!["combo".to_string()]);
        assert!(t2.released.is_empty());
        assert!(t3.pressed.is_empty());
        assert!(t3.released.is_empty());
        assert!(t4.pressed.is_empty());
        assert_eq!(t4.released, vec!["combo".to_string()]);
        assert_eq!(t5.pressed, vec!["combo".to_string()]);
        assert!(t5.released.is_empty());
    }

    #[test]
    fn test_single_key_not_retriggered_by_other_key_release_pattern() {
        let hotkeys = vec![hk("a_only", &["a"])];
        let mut pressed = HashSet::new();
        let mut active = HashSet::new();

        let t1 = apply_hotkey_event(&hotkeys, &mut pressed, &mut active, "a".to_string(), true);
        let t2 = apply_hotkey_event(&hotkeys, &mut pressed, &mut active, "b".to_string(), true);
        let t3 = apply_hotkey_event(&hotkeys, &mut pressed, &mut active, "b".to_string(), false);
        // Simulate spurious duplicate KeyPress for already-held key after multi-key release.
        let t4 = apply_hotkey_event(&hotkeys, &mut pressed, &mut active, "a".to_string(), true);
        let t5 = apply_hotkey_event(&hotkeys, &mut pressed, &mut active, "a".to_string(), false);
        let t6 = apply_hotkey_event(&hotkeys, &mut pressed, &mut active, "a".to_string(), true);

        assert_eq!(t1.pressed, vec!["a_only".to_string()]);
        assert!(t1.released.is_empty());
        assert!(t2.pressed.is_empty());
        assert!(t2.released.is_empty());
        assert!(t3.pressed.is_empty());
        assert!(t3.released.is_empty());
        assert!(t4.pressed.is_empty());
        assert!(t4.released.is_empty());
        assert!(t5.pressed.is_empty());
        assert_eq!(t5.released, vec!["a_only".to_string()]);
        assert_eq!(t6.pressed, vec!["a_only".to_string()]);
        assert!(t6.released.is_empty());
    }
}
