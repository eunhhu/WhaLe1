use crate::state::input_state::InputManager;
use rdev::{simulate, EventType, Key};
use std::thread;
use std::time::Duration;
use tauri::State;

#[tauri::command]
pub fn input_register_hotkey(
    input_manager: State<'_, InputManager>,
    id: String,
    keys: Vec<String>,
) {
    input_manager.register_hotkey(&id, keys);
}

#[tauri::command]
pub fn input_unregister_hotkey(input_manager: State<'_, InputManager>, id: String) {
    input_manager.unregister_hotkey(&id);
}

#[tauri::command]
pub fn input_simulate_key_press(key: String) -> Result<(), String> {
    let rdev_key = string_to_key(&key).ok_or(format!("Unknown key: {}", key))?;
    simulate(&EventType::KeyPress(rdev_key)).map_err(|e| format!("{:?}", e))?;
    thread::sleep(Duration::from_millis(20));
    simulate(&EventType::KeyRelease(rdev_key)).map_err(|e| format!("{:?}", e))?;
    Ok(())
}

#[tauri::command]
pub fn input_simulate_key_down(key: String) -> Result<(), String> {
    let rdev_key = string_to_key(&key).ok_or(format!("Unknown key: {}", key))?;
    simulate(&EventType::KeyPress(rdev_key)).map_err(|e| format!("{:?}", e))
}

#[tauri::command]
pub fn input_simulate_key_up(key: String) -> Result<(), String> {
    let rdev_key = string_to_key(&key).ok_or(format!("Unknown key: {}", key))?;
    simulate(&EventType::KeyRelease(rdev_key)).map_err(|e| format!("{:?}", e))
}

#[tauri::command]
pub fn input_simulate_mouse_click(x: f64, y: f64) -> Result<(), String> {
    simulate(&EventType::MouseMove { x, y }).map_err(|e| format!("{:?}", e))?;
    thread::sleep(Duration::from_millis(20));
    simulate(&EventType::ButtonPress(rdev::Button::Left)).map_err(|e| format!("{:?}", e))?;
    thread::sleep(Duration::from_millis(20));
    simulate(&EventType::ButtonRelease(rdev::Button::Left)).map_err(|e| format!("{:?}", e))?;
    Ok(())
}

#[tauri::command]
pub fn input_simulate_mouse_move(x: f64, y: f64) -> Result<(), String> {
    simulate(&EventType::MouseMove { x, y }).map_err(|e| format!("{:?}", e))
}

fn string_to_key(s: &str) -> Option<Key> {
    match s.to_lowercase().as_str() {
        "a" => Some(Key::KeyA),
        "b" => Some(Key::KeyB),
        "c" => Some(Key::KeyC),
        "d" => Some(Key::KeyD),
        "e" => Some(Key::KeyE),
        "f" => Some(Key::KeyF),
        "g" => Some(Key::KeyG),
        "h" => Some(Key::KeyH),
        "i" => Some(Key::KeyI),
        "j" => Some(Key::KeyJ),
        "k" => Some(Key::KeyK),
        "l" => Some(Key::KeyL),
        "m" => Some(Key::KeyM),
        "n" => Some(Key::KeyN),
        "o" => Some(Key::KeyO),
        "p" => Some(Key::KeyP),
        "q" => Some(Key::KeyQ),
        "r" => Some(Key::KeyR),
        "s" => Some(Key::KeyS),
        "t" => Some(Key::KeyT),
        "u" => Some(Key::KeyU),
        "v" => Some(Key::KeyV),
        "w" => Some(Key::KeyW),
        "x" => Some(Key::KeyX),
        "y" => Some(Key::KeyY),
        "z" => Some(Key::KeyZ),
        "0" => Some(Key::Num0),
        "1" => Some(Key::Num1),
        "2" => Some(Key::Num2),
        "3" => Some(Key::Num3),
        "4" => Some(Key::Num4),
        "5" => Some(Key::Num5),
        "6" => Some(Key::Num6),
        "7" => Some(Key::Num7),
        "8" => Some(Key::Num8),
        "9" => Some(Key::Num9),
        "f1" => Some(Key::F1),
        "f2" => Some(Key::F2),
        "f3" => Some(Key::F3),
        "f4" => Some(Key::F4),
        "f5" => Some(Key::F5),
        "f6" => Some(Key::F6),
        "f7" => Some(Key::F7),
        "f8" => Some(Key::F8),
        "f9" => Some(Key::F9),
        "f10" => Some(Key::F10),
        "f11" => Some(Key::F11),
        "f12" => Some(Key::F12),
        "escape" | "esc" => Some(Key::Escape),
        "enter" | "return" => Some(Key::Return),
        "space" => Some(Key::Space),
        "tab" => Some(Key::Tab),
        "backspace" => Some(Key::Backspace),
        "delete" | "del" => Some(Key::Delete),
        "up" => Some(Key::UpArrow),
        "down" => Some(Key::DownArrow),
        "left" => Some(Key::LeftArrow),
        "right" => Some(Key::RightArrow),
        "home" => Some(Key::Home),
        "end" => Some(Key::End),
        "pageup" => Some(Key::PageUp),
        "pagedown" => Some(Key::PageDown),
        "shift" => Some(Key::ShiftLeft),
        "ctrl" | "control" => Some(Key::ControlLeft),
        "alt" => Some(Key::Alt),
        "meta" | "super" | "cmd" => Some(Key::MetaLeft),
        _ => None,
    }
}
