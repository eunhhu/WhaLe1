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
