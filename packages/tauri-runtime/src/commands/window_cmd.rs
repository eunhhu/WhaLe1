use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

#[derive(Debug, Deserialize)]
pub struct WindowCreateConfig {
    pub id: String,
    pub url: String,
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

#[tauri::command]
pub fn window_show(app: AppHandle, id: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window.show().map_err(|e| e.to_string())?;
    emit_visibility(&app, &id, true);
    Ok(())
}

#[tauri::command]
pub fn window_hide(app: AppHandle, id: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window.hide().map_err(|e| e.to_string())?;
    emit_visibility(&app, &id, false);
    Ok(())
}

#[tauri::command]
pub fn window_toggle(app: AppHandle, id: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    let visible = window.is_visible().map_err(|e| e.to_string())?;
    if visible {
        window.hide().map_err(|e| e.to_string())?;
        emit_visibility(&app, &id, false);
        Ok(())
    } else {
        window.show().map_err(|e| e.to_string())?;
        emit_visibility(&app, &id, true);
        Ok(())
    }
}

#[tauri::command]
pub fn window_close(app: AppHandle, id: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window.close().map_err(|e| e.to_string())?;
    emit_visibility(&app, &id, false);
    Ok(())
}

#[tauri::command]
pub fn window_set_position(app: AppHandle, id: String, x: f64, y: f64) -> Result<(), String> {
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window
        .set_position(tauri::Position::Logical(tauri::LogicalPosition::new(x, y)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_set_size(
    app: AppHandle,
    id: String,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window
        .set_size(tauri::Size::Logical(tauri::LogicalSize::new(width, height)))
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_set_always_on_top(
    app: AppHandle,
    id: String,
    value: bool,
) -> Result<(), String> {
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window.set_always_on_top(value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_center(app: AppHandle, id: String) -> Result<(), String> {
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window.center().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_is_visible(app: AppHandle, id: String) -> Result<bool, String> {
    let window = app
        .get_webview_window(&id)
        .ok_or_else(|| format!("Window '{}' not found", id))?;
    window.is_visible().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_create(app: AppHandle, config: WindowCreateConfig) -> Result<(), String> {
    let url = WebviewUrl::App(config.url.into());
    let mut builder = WebviewWindowBuilder::new(&app, &config.id, url);

    if let Some(width) = config.width {
        if let Some(height) = config.height {
            builder = builder.inner_size(width, height);
        }
    }

    if let Some(decorations) = config.decorations {
        builder = builder.decorations(decorations);
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

    builder.build().map_err(|e| e.to_string())?;
    emit_visibility(&app, &config.id, config.visible.unwrap_or(true));

    Ok(())
}
