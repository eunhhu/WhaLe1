mod bridge;
mod commands;
mod preamble;
mod state;

use tauri::Manager;

use state::frida_state::FridaManager;
use state::input_state::InputManager;
use state::store_state::StoreManager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(InputManager::new())
    .invoke_handler(tauri::generate_handler![
      // Store
      commands::store_cmd::store_register,
      commands::store_cmd::store_get,
      commands::store_cmd::store_set,
      commands::store_cmd::store_get_all,
      commands::store_cmd::store_subscribe,
      commands::store_cmd::store_unsubscribe,
      commands::store_cmd::store_get_persist_enabled,
      commands::store_cmd::store_set_persist_enabled,
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
      commands::frida_cmd::frida_enumerate_processes,
      commands::frida_cmd::frida_spawn,
      commands::frida_cmd::frida_resume,
      commands::frida_cmd::frida_attach,
      commands::frida_cmd::frida_load_script,
      commands::frida_cmd::frida_load_script_file,
      commands::frida_cmd::frida_unload_script,
      commands::frida_cmd::frida_detach,
    ])
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      // Store persistence: resolve app data dir for store file
      let persist_path = app
        .path()
        .app_data_dir()
        .ok()
        .map(|dir| dir.join("whale_stores.json"));
      let store_manager = StoreManager::new(persist_path);
      store_manager.start_persist_loop();
      app.manage(store_manager);

      // FridaManager: spawn worker thread with AppHandle for bridge callbacks
      let frida_manager = FridaManager::new(app.handle().clone());
      app.manage(frida_manager);

      // Start global key listener (rdev)
      let input_manager = app.state::<InputManager>();
      input_manager.start_listener(app.handle().clone());
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
