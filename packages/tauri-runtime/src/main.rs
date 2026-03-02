#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;
mod commands;
mod preamble;
mod state;

use tauri::Manager;

use state::frida_state::FridaManager;
use state::input_state::InputManager;
use state::store_state::StoreManager;

fn main() {
    tauri::Builder::default()
        .manage(StoreManager::new(None))
        .manage(InputManager::new())
        .manage(FridaManager::new())
        .invoke_handler(tauri::generate_handler![
            // Store
            commands::store_cmd::store_register,
            commands::store_cmd::store_get,
            commands::store_cmd::store_set,
            commands::store_cmd::store_get_all,
            // Window
            commands::window_cmd::window_show,
            commands::window_cmd::window_hide,
            commands::window_cmd::window_toggle,
            commands::window_cmd::window_close,
            commands::window_cmd::window_set_position,
            commands::window_cmd::window_set_size,
            commands::window_cmd::window_set_always_on_top,
            commands::window_cmd::window_center,
            commands::window_cmd::window_is_visible,
            commands::window_cmd::window_create,
            // Input (rdev)
            commands::input_cmd::input_register_hotkey,
            commands::input_cmd::input_unregister_hotkey,
            commands::input_cmd::input_simulate_key_press,
            commands::input_cmd::input_simulate_key_down,
            commands::input_cmd::input_simulate_key_up,
            commands::input_cmd::input_simulate_mouse_click,
            commands::input_cmd::input_simulate_mouse_move,
            // Frida
            commands::frida_cmd::frida_list_devices,
            commands::frida_cmd::frida_spawn,
            commands::frida_cmd::frida_attach,
            commands::frida_cmd::frida_load_script,
            commands::frida_cmd::frida_load_script_file,
            commands::frida_cmd::frida_detach,
        ])
        .setup(|app| {
            // rdev input listener 시작
            let input_manager = app.state::<InputManager>();
            input_manager.start_listener(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
