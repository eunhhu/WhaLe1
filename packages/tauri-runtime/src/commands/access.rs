use tauri::{AppHandle, Manager, WebviewWindow};

pub(crate) fn primary_window_label_from_iter<'a>(
    labels: impl IntoIterator<Item = &'a str>,
) -> Option<String> {
    labels
        .into_iter()
        .find(|label| !label.starts_with("__"))
        .map(str::to_string)
}

pub(crate) fn can_use_privileged_api(caller: &str, primary: &str) -> bool {
    caller == primary
}

pub(crate) fn can_access_window_target(caller: &str, target: &str, primary: &str) -> bool {
    caller == primary || caller == target
}

pub(crate) fn can_access_devtools(caller: &str, primary: &str) -> bool {
    caller == primary || caller == "__devtools__"
}

fn primary_window_label(app: &AppHandle) -> Result<String, String> {
    primary_window_label_from_iter(app.config().app.windows.iter().map(|window| window.label.as_str()))
        .ok_or_else(|| "No primary application window configured".to_string())
}

pub(crate) fn ensure_privileged_window(window: &WebviewWindow) -> Result<(), String> {
    let app = window.app_handle();
    let primary = primary_window_label(&app)?;
    if can_use_privileged_api(window.label(), &primary) {
        return Ok(());
    }
    Err(format!(
        "Window '{}' is not allowed to use privileged runtime commands",
        window.label()
    ))
}

pub(crate) fn ensure_window_access(window: &WebviewWindow, target: &str) -> Result<(), String> {
    let app = window.app_handle();
    let primary = primary_window_label(&app)?;
    if can_access_window_target(window.label(), target, &primary) {
        return Ok(());
    }
    Err(format!(
        "Window '{}' is not allowed to control window '{}'",
        window.label(),
        target
    ))
}

pub(crate) fn ensure_devtools_access(window: &WebviewWindow) -> Result<(), String> {
    let app = window.app_handle();
    let primary = primary_window_label(&app)?;
    if can_access_devtools(window.label(), &primary) {
        return Ok(());
    }
    Err(format!(
        "Window '{}' is not allowed to access devtools data",
        window.label()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn picks_first_non_internal_window_as_primary() {
        let labels = vec!["__devtools__", "main", "overlay"];
        assert_eq!(
            primary_window_label_from_iter(labels),
            Some("main".to_string())
        );
    }

    #[test]
    fn privileged_api_is_limited_to_primary_window() {
        assert!(can_use_privileged_api("main", "main"));
        assert!(!can_use_privileged_api("overlay", "main"));
    }

    #[test]
    fn window_access_allows_self_or_primary() {
        assert!(can_access_window_target("main", "overlay", "main"));
        assert!(can_access_window_target("overlay", "overlay", "main"));
        assert!(!can_access_window_target("settings", "overlay", "main"));
    }

    #[test]
    fn devtools_access_allows_primary_and_devtools() {
        assert!(can_access_devtools("main", "main"));
        assert!(can_access_devtools("__devtools__", "main"));
        assert!(!can_access_devtools("overlay", "main"));
    }
}
