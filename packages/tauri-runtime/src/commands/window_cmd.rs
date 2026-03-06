use crate::commands::access::ensure_window_access;
use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Debug, Deserialize)]
pub struct WindowCreateConfig {
    pub id: String,
    pub url: String,
    pub title: Option<String>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub transparent: Option<bool>,
    pub decorations: Option<bool>,
    pub always_on_top: Option<bool>,
    pub skip_taskbar: Option<bool>,
    pub visible: Option<bool>,
    pub x: Option<f64>,
    pub y: Option<f64>,
}

fn emit_visibility(app: &AppHandle, id: &str, visible: bool) {
    let _ = app.emit(
        "window:visibility-changed",
        serde_json::json!({ "id": id, "visible": visible }),
    );
}

#[cfg(target_os = "macos")]
fn apply_macos_window_background(window: &tauri::WebviewWindow, transparent: bool) {
    let _ = window.with_webview(move |webview| unsafe {
        use objc2_app_kit::NSColor;
        use objc2_foundation::{NSObjectNSKeyValueCoding, NSString};

        let ns_win: &objc2_app_kit::NSWindow = &*webview.ns_window().cast();
        let wv: &objc2_web_kit::WKWebView = &*webview.inner().cast();
        let key = NSString::from_str("drawsBackground");
        let no = objc2_foundation::NSNumber::new_bool(false);
        wv.setValue_forKey(Some(&no), &key);

        if transparent {
            ns_win.setTitlebarAppearsTransparent(true);
            ns_win.setBackgroundColor(Some(&NSColor::clearColor()));
        } else {
            let bg = NSColor::colorWithSRGBRed_green_blue_alpha(
                15.0 / 255.0,
                15.0 / 255.0,
                23.0 / 255.0,
                1.0,
            );
            ns_win.setBackgroundColor(Some(&bg));
        }
    });
}

fn create_window_from_config(app: &AppHandle, id: &str) -> Result<tauri::WebviewWindow, String> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == id)
        .ok_or_else(|| format!("Window '{}' not found in config", id))?;
    let transparent = config.transparent;

    let window = WebviewWindowBuilder::from_config(app, config)
        .map_err(|e| e.to_string())?
        .build()
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    apply_macos_window_background(&window, transparent);

    Ok(window)
}

fn get_or_create_window(app: &AppHandle, id: &str) -> Result<tauri::WebviewWindow, String> {
    if let Some(window) = app.get_webview_window(id) {
        return Ok(window);
    }
    create_window_from_config(app, id)
}

#[tauri::command]
pub fn window_show(window: WebviewWindow, app: AppHandle, id: String) -> Result<(), String> {
    ensure_window_access(&window, &id)?;
    let window = get_or_create_window(&app, &id)?;
    window.show().map_err(|e| e.to_string())?;
    let _ = window.set_focus();
    emit_visibility(&app, &id, true);
    Ok(())
}

#[tauri::command]
pub fn window_hide(window: WebviewWindow, app: AppHandle, id: String) -> Result<(), String> {
    ensure_window_access(&window, &id)?;
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window.hide().map_err(|e| e.to_string())?;
    emit_visibility(&app, &id, false);
    Ok(())
}

#[tauri::command]
pub fn window_toggle(window: WebviewWindow, app: AppHandle, id: String) -> Result<(), String> {
    ensure_window_access(&window, &id)?;
    match app.get_webview_window(&id) {
        Some(window) => {
            let visible = window.is_visible().map_err(|e| e.to_string())?;
            if visible {
                window.hide().map_err(|e| e.to_string())?;
                emit_visibility(&app, &id, false);
            } else {
                window.show().map_err(|e| e.to_string())?;
                let _ = window.set_focus();
                emit_visibility(&app, &id, true);
            }
            Ok(())
        }
        None => {
            let window = create_window_from_config(&app, &id)?;
            window.show().map_err(|e| e.to_string())?;
            let _ = window.set_focus();
            emit_visibility(&app, &id, true);
            Ok(())
        }
    }
}

#[tauri::command]
pub fn window_close(window: WebviewWindow, app: AppHandle, id: String) -> Result<(), String> {
    ensure_window_access(&window, &id)?;
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window.close().map_err(|e| e.to_string())?;
    emit_visibility(&app, &id, false);
    Ok(())
}

#[tauri::command]
pub fn window_set_position(
    window: WebviewWindow,
    app: AppHandle,
    id: String,
    x: f64,
    y: f64,
) -> Result<(), String> {
    ensure_window_access(&window, &id)?;
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window
        .set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_set_size(
    window: WebviewWindow,
    app: AppHandle,
    id: String,
    width: f64,
    height: f64,
) -> Result<(), String> {
    ensure_window_access(&window, &id)?;
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_set_always_on_top(
    window: WebviewWindow,
    app: AppHandle,
    id: String,
    value: bool,
) -> Result<(), String> {
    ensure_window_access(&window, &id)?;
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window.set_always_on_top(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_center(window: WebviewWindow, app: AppHandle, id: String) -> Result<(), String> {
    ensure_window_access(&window, &id)?;
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window.center().map_err(|e| e.to_string())
}

fn configured_window_visibility(app: &AppHandle, id: &str) -> Option<bool> {
    app.config()
        .app
        .windows
        .iter()
        .find(|window| window.label == id)
        .map(|window| window.visible)
}

#[tauri::command]
pub fn window_is_visible(
    window: WebviewWindow,
    app: AppHandle,
    id: String,
) -> Result<bool, String> {
    ensure_window_access(&window, &id)?;
    if let Some(window) = app.get_webview_window(&id) {
        return window.is_visible().map_err(|e| e.to_string());
    }
    if let Some(visible) = configured_window_visibility(&app, &id) {
        return Ok(visible);
    }
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window.is_visible().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_create(
    window: WebviewWindow,
    app: AppHandle,
    config: WindowCreateConfig,
) -> Result<(), String> {
    ensure_window_access(&window, &config.id)?;
    let url = WebviewUrl::App(config.url.into());
    let mut builder = WebviewWindowBuilder::new(&app, &config.id, url);

    if let Some(width) = config.width {
        if let Some(height) = config.height {
            builder = builder.inner_size(width, height);
        }
    }

    if let Some(title) = config.title {
        builder = builder.title(title);
    }

    if let Some(decorations) = config.decorations {
        builder = builder.decorations(decorations);
    }

    if let Some(transparent) = config.transparent {
        #[cfg(not(target_os = "macos"))]
        {
            builder = builder.transparent(transparent);
        }
        #[cfg(target_os = "macos")]
        {
            let _ = transparent;
        }
    }

    if let Some(always_on_top) = config.always_on_top {
        builder = builder.always_on_top(always_on_top);
    }

    if let Some(skip_taskbar) = config.skip_taskbar {
        builder = builder.skip_taskbar(skip_taskbar);
    }

    if let Some(visible) = config.visible {
        builder = builder.visible(visible);
    }

    if let (Some(x), Some(y)) = (config.x, config.y) {
        builder = builder.position(x, y);
    }

    let window = builder.build().map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    apply_macos_window_background(&window, config.transparent.unwrap_or(false));

    emit_visibility(&app, &config.id, config.visible.unwrap_or(true));

    Ok(())
}
