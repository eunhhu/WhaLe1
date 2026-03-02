use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

struct StoreInner {
    stores: Mutex<HashMap<String, HashMap<String, Value>>>,
    persist_path: Option<PathBuf>,
    dirty: AtomicBool,
    /// store_name → (window_label → subscribed_keys)
    subscriptions: Mutex<HashMap<String, HashMap<String, Vec<String>>>>,
}

pub struct StoreManager {
    inner: Arc<StoreInner>,
}

impl StoreManager {
    pub fn new(persist_path: Option<PathBuf>) -> Self {
        let stores = if let Some(ref path) = persist_path {
            if path.exists() {
                let data = fs::read_to_string(path).unwrap_or_default();
                serde_json::from_str(&data).unwrap_or_default()
            } else {
                HashMap::new()
            }
        } else {
            HashMap::new()
        };

        Self {
            inner: Arc::new(StoreInner {
                stores: Mutex::new(stores),
                persist_path,
                dirty: AtomicBool::new(false),
                subscriptions: Mutex::new(HashMap::new()),
            }),
        }
    }

    pub fn register(&self, name: &str, defaults: HashMap<String, Value>) {
        let mut stores = self.inner.stores.lock().unwrap();
        stores.entry(name.to_string()).or_insert(defaults);
    }

    pub fn get(&self, name: &str) -> Option<HashMap<String, Value>> {
        let stores = self.inner.stores.lock().unwrap();
        stores.get(name).cloned()
    }

    pub fn set(&self, name: &str, key: &str, value: Value) -> Option<HashMap<String, Value>> {
        let mut stores = self.inner.stores.lock().unwrap();
        if let Some(store) = stores.get_mut(name) {
            store.insert(key.to_string(), value.clone());
            self.inner.dirty.store(true, Ordering::Relaxed);
            let mut patch = HashMap::new();
            patch.insert(key.to_string(), value);
            Some(patch)
        } else {
            None
        }
    }

    pub fn merge_patch(&self, name: &str, patch: HashMap<String, Value>) -> bool {
        let mut stores = self.inner.stores.lock().unwrap();
        if let Some(store) = stores.get_mut(name) {
            for (k, v) in patch {
                store.insert(k, v);
            }
            self.inner.dirty.store(true, Ordering::Relaxed);
            true
        } else {
            false
        }
    }

    pub fn persist(&self) {
        if let Some(ref path) = self.inner.persist_path {
            let stores = self.inner.stores.lock().unwrap();
            if let Ok(data) = serde_json::to_string_pretty(&*stores) {
                let _ = fs::create_dir_all(path.parent().unwrap_or(path));
                let _ = fs::write(path, data);
            }
        }
    }

    /// Spawns a background thread that persists dirty state every 500ms.
    pub fn start_persist_loop(&self) {
        let inner = Arc::clone(&self.inner);
        thread::spawn(move || loop {
            thread::sleep(Duration::from_millis(500));
            if inner.dirty.swap(false, Ordering::Relaxed) {
                if let Some(ref path) = inner.persist_path {
                    let stores = inner.stores.lock().unwrap();
                    if let Ok(data) = serde_json::to_string_pretty(&*stores) {
                        let _ = fs::create_dir_all(path.parent().unwrap_or(path));
                        let _ = fs::write(path, data);
                    }
                }
            }
        });
    }

    /// Immediately persists if dirty.
    pub fn flush(&self) {
        if self.inner.dirty.swap(false, Ordering::Relaxed) {
            self.persist();
        }
    }

    /// Register a window's interest in specific keys of a store.
    pub fn subscribe(&self, store: &str, window: &str, keys: Vec<String>) {
        let mut subs = self.inner.subscriptions.lock().unwrap();
        subs.entry(store.to_string())
            .or_default()
            .insert(window.to_string(), keys);
    }

    /// Remove a window's subscription from a store.
    pub fn unsubscribe(&self, store: &str, window: &str) {
        let mut subs = self.inner.subscriptions.lock().unwrap();
        if let Some(store_subs) = subs.get_mut(store) {
            store_subs.remove(window);
        }
    }

    /// Returns window labels subscribed to any of the changed keys.
    /// If a window has no subscription entry for this store, it is NOT included
    /// (only explicitly subscribed windows receive updates).
    pub fn get_subscribed_windows(&self, store: &str, changed_keys: &[String]) -> Vec<String> {
        let subs = self.inner.subscriptions.lock().unwrap();
        let Some(store_subs) = subs.get(store) else {
            return Vec::new();
        };
        store_subs
            .iter()
            .filter(|(_label, keys)| {
                changed_keys.iter().any(|ck| keys.contains(ck))
            })
            .map(|(label, _)| label.clone())
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;

    // --- register → get → 값 일치 확인 ---
    #[test]
    fn test_register_then_get_returns_defaults() {
        let mgr = StoreManager::new(None);
        let mut defaults = HashMap::new();
        defaults.insert("speed".to_string(), json!(1.0));
        defaults.insert("enabled".to_string(), json!(true));

        mgr.register("trainer", defaults.clone());

        let got = mgr.get("trainer").expect("store should exist");
        assert_eq!(got.get("speed"), Some(&json!(1.0)));
        assert_eq!(got.get("enabled"), Some(&json!(true)));
    }

    #[test]
    fn test_get_nonexistent_store_returns_none() {
        let mgr = StoreManager::new(None);
        assert!(mgr.get("nonexistent").is_none());
    }

    #[test]
    fn test_register_does_not_overwrite_existing() {
        let mgr = StoreManager::new(None);
        let mut defaults1 = HashMap::new();
        defaults1.insert("x".to_string(), json!(1));
        mgr.register("s", defaults1);

        let mut defaults2 = HashMap::new();
        defaults2.insert("x".to_string(), json!(999));
        mgr.register("s", defaults2);

        let got = mgr.get("s").unwrap();
        assert_eq!(got.get("x"), Some(&json!(1)), "or_insert should keep first");
    }

    // --- set → get → 변경 값 확인 ---
    #[test]
    fn test_set_then_get_returns_updated_value() {
        let mgr = StoreManager::new(None);
        let mut defaults = HashMap::new();
        defaults.insert("hp".to_string(), json!(100));
        mgr.register("game", defaults);

        let patch = mgr.set("game", "hp", json!(50));
        assert!(patch.is_some());

        let got = mgr.get("game").unwrap();
        assert_eq!(got.get("hp"), Some(&json!(50)));
    }

    #[test]
    fn test_set_on_nonexistent_store_returns_none() {
        let mgr = StoreManager::new(None);
        assert!(mgr.set("nope", "key", json!(1)).is_none());
    }

    #[test]
    fn test_set_returns_patch_with_changed_key() {
        let mgr = StoreManager::new(None);
        let mut defaults = HashMap::new();
        defaults.insert("a".to_string(), json!(0));
        mgr.register("s", defaults);

        let patch = mgr.set("s", "a", json!(42)).unwrap();
        assert_eq!(patch.len(), 1);
        assert_eq!(patch.get("a"), Some(&json!(42)));
    }

    // --- merge_patch → get → 병합 값 확인 ---
    #[test]
    fn test_merge_patch_updates_multiple_keys() {
        let mgr = StoreManager::new(None);
        let mut defaults = HashMap::new();
        defaults.insert("x".to_string(), json!(0));
        defaults.insert("y".to_string(), json!(0));
        defaults.insert("z".to_string(), json!(0));
        mgr.register("pos", defaults);

        let mut patch = HashMap::new();
        patch.insert("x".to_string(), json!(10));
        patch.insert("y".to_string(), json!(20));
        assert!(mgr.merge_patch("pos", patch));

        let got = mgr.get("pos").unwrap();
        assert_eq!(got.get("x"), Some(&json!(10)));
        assert_eq!(got.get("y"), Some(&json!(20)));
        assert_eq!(got.get("z"), Some(&json!(0)), "z should remain unchanged");
    }

    #[test]
    fn test_merge_patch_on_nonexistent_store_returns_false() {
        let mgr = StoreManager::new(None);
        let patch = HashMap::new();
        assert!(!mgr.merge_patch("nope", patch));
    }

    // --- subscribe → get_subscribed_windows → 올바른 윈도우 반환 ---
    #[test]
    fn test_subscribe_and_get_subscribed_windows() {
        let mgr = StoreManager::new(None);
        mgr.subscribe("trainer", "overlay", vec!["speed".to_string(), "hp".to_string()]);
        mgr.subscribe("trainer", "main", vec!["speed".to_string()]);

        let changed = vec!["speed".to_string()];
        let mut windows = mgr.get_subscribed_windows("trainer", &changed);
        windows.sort();
        assert_eq!(windows, vec!["main", "overlay"]);
    }

    #[test]
    fn test_subscribe_filters_by_changed_keys() {
        let mgr = StoreManager::new(None);
        mgr.subscribe("s", "win1", vec!["a".to_string()]);
        mgr.subscribe("s", "win2", vec!["b".to_string()]);

        let changed = vec!["a".to_string()];
        let windows = mgr.get_subscribed_windows("s", &changed);
        assert_eq!(windows, vec!["win1"]);
    }

    #[test]
    fn test_get_subscribed_windows_no_store_returns_empty() {
        let mgr = StoreManager::new(None);
        let windows = mgr.get_subscribed_windows("nope", &vec!["x".to_string()]);
        assert!(windows.is_empty());
    }

    // --- unsubscribe → get_subscribed_windows → 빈 배열 반환 ---
    #[test]
    fn test_unsubscribe_removes_window() {
        let mgr = StoreManager::new(None);
        mgr.subscribe("s", "win1", vec!["a".to_string()]);
        mgr.subscribe("s", "win2", vec!["a".to_string()]);

        mgr.unsubscribe("s", "win1");

        let changed = vec!["a".to_string()];
        let windows = mgr.get_subscribed_windows("s", &changed);
        assert_eq!(windows, vec!["win2"]);
    }

    #[test]
    fn test_unsubscribe_all_returns_empty() {
        let mgr = StoreManager::new(None);
        mgr.subscribe("s", "win1", vec!["a".to_string()]);
        mgr.unsubscribe("s", "win1");

        let changed = vec!["a".to_string()];
        let windows = mgr.get_subscribed_windows("s", &changed);
        assert!(windows.is_empty());
    }

    // --- persist + flush 테스트 (임시 파일 사용) ---
    #[test]
    fn test_persist_writes_to_file() {
        let dir = std::env::temp_dir().join("whale_test_persist");
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("stores.json");

        let mgr = StoreManager::new(Some(path.clone()));
        let mut defaults = HashMap::new();
        defaults.insert("level".to_string(), json!(5));
        mgr.register("game", defaults);

        mgr.persist();

        let content = fs::read_to_string(&path).expect("file should exist");
        let parsed: HashMap<String, HashMap<String, Value>> =
            serde_json::from_str(&content).expect("valid JSON");
        assert_eq!(parsed.get("game").unwrap().get("level"), Some(&json!(5)));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_persist_without_path_is_noop() {
        let mgr = StoreManager::new(None);
        let mut defaults = HashMap::new();
        defaults.insert("x".to_string(), json!(1));
        mgr.register("s", defaults);
        // Should not panic
        mgr.persist();
    }

    // --- dirty flag + flush 테스트 ---
    #[test]
    fn test_flush_only_persists_when_dirty() {
        let dir = std::env::temp_dir().join("whale_test_flush");
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("stores.json");

        let mgr = StoreManager::new(Some(path.clone()));
        let mut defaults = HashMap::new();
        defaults.insert("v".to_string(), json!(0));
        mgr.register("s", defaults);

        // flush without dirty — no file should be created
        mgr.flush();
        assert!(!path.exists(), "flush without dirty should not write");

        // set makes it dirty
        mgr.set("s", "v", json!(42));
        mgr.flush();
        assert!(path.exists(), "flush after set should write");

        let content = fs::read_to_string(&path).unwrap();
        let parsed: HashMap<String, HashMap<String, Value>> =
            serde_json::from_str(&content).unwrap();
        assert_eq!(parsed.get("s").unwrap().get("v"), Some(&json!(42)));

        // flush again without changes — dirty should be false
        // Remove file, flush again — file should NOT reappear
        let _ = fs::remove_file(&path);
        mgr.flush();
        assert!(!path.exists(), "second flush without changes should not write");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_merge_patch_sets_dirty_flag() {
        let dir = std::env::temp_dir().join("whale_test_merge_dirty");
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("stores.json");

        let mgr = StoreManager::new(Some(path.clone()));
        let mut defaults = HashMap::new();
        defaults.insert("a".to_string(), json!(0));
        mgr.register("s", defaults);

        let mut patch = HashMap::new();
        patch.insert("a".to_string(), json!(99));
        mgr.merge_patch("s", patch);

        mgr.flush();
        assert!(path.exists(), "merge_patch should set dirty, flush should write");

        let _ = fs::remove_dir_all(&dir);
    }

    // --- persist_loop 테스트 ---
    #[test]
    fn test_start_persist_loop_auto_flushes() {
        let dir = std::env::temp_dir().join("whale_test_persist_loop");
        let _ = fs::remove_dir_all(&dir);
        let path = dir.join("stores.json");

        let mgr = StoreManager::new(Some(path.clone()));
        let mut defaults = HashMap::new();
        defaults.insert("tick".to_string(), json!(0));
        mgr.register("s", defaults);

        mgr.start_persist_loop();
        mgr.set("s", "tick", json!(1));

        // Wait for persist loop to run (loop is 500ms)
        thread::sleep(Duration::from_millis(700));

        assert!(path.exists(), "persist loop should have auto-flushed");
        let content = fs::read_to_string(&path).unwrap();
        let parsed: HashMap<String, HashMap<String, Value>> =
            serde_json::from_str(&content).unwrap();
        assert_eq!(parsed.get("s").unwrap().get("tick"), Some(&json!(1)));

        let _ = fs::remove_dir_all(&dir);
    }

    // --- 파일에서 로드 테스트 ---
    #[test]
    fn test_new_loads_from_existing_file() {
        let dir = std::env::temp_dir().join("whale_test_load");
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        let path = dir.join("stores.json");

        // Pre-write a store file
        let mut stores: HashMap<String, HashMap<String, Value>> = HashMap::new();
        let mut data = HashMap::new();
        data.insert("saved".to_string(), json!(true));
        stores.insert("persisted".to_string(), data);
        fs::write(&path, serde_json::to_string_pretty(&stores).unwrap()).unwrap();

        let mgr = StoreManager::new(Some(path));
        let got = mgr.get("persisted").expect("should load from file");
        assert_eq!(got.get("saved"), Some(&json!(true)));

        let _ = fs::remove_dir_all(&dir);
    }
}
