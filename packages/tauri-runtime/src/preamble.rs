/// __<store_name>__ 프리앰블 생성
/// Frida 스크립트에 자동 삽입되어 in-process 상태 접근을 제공
pub fn generate(store_name: &str, initial_state_json: &str) -> String {
    let var_name = store_global_var_name(store_name);
    format!(
        r#"const {var_name} = (() => {{
  const _data = {initial_state};
  const _dirty = new Set();
  let _timer = null;
  const _flush = () => {{
    if (_dirty.size === 0) return;
    const patch = {{}};
    for (const k of _dirty) patch[k] = _data[k];
    _dirty.clear();
    _timer = null;
    send({{ __whale: true, store: '{store_name}', patch }});
  }};
  recv('config', (msg) => {{ Object.assign(_data, msg.payload); }});
  return new Proxy(_data, {{
    get(target, key) {{
      if (key === 'set') {{
        return (k, v) => {{
          target[k] = v;
          _dirty.add(k);
          if (!_timer) _timer = setTimeout(_flush, 16);
        }};
      }}
      return target[key];
    }},
  }});
}})();"#,
        var_name = var_name,
        initial_state = initial_state_json,
        store_name = store_name,
    )
}

fn store_global_var_name(store_name: &str) -> String {
    let mut normalized = String::with_capacity(store_name.len());
    for ch in store_name.chars() {
        if ch.is_ascii_alphanumeric() || ch == '_' || ch == '$' {
            normalized.push(ch);
        } else {
            normalized.push('_');
        }
    }
    if normalized.is_empty() {
        normalized.push_str("store");
    }
    format!("__{normalized}__")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_preamble_contains_store_name() {
        let result = generate("trainer", r#"{"speed":1.0}"#);
        assert!(result.contains("trainer"));
        assert!(result.contains(r#"{"speed":1.0}"#));
        assert!(result.contains("__trainer__"));
        assert!(result.contains("__whale: true"));
    }

    #[test]
    fn test_preamble_has_proxy() {
        let result = generate("test", "{}");
        assert!(result.contains("new Proxy"));
        assert!(result.contains("recv('config'"));
        assert!(result.contains("setTimeout(_flush, 16)"));
    }

    #[test]
    fn test_preamble_has_recv_config_handler() {
        let result = generate("game", r#"{"hp":100}"#);
        // recv('config') handler must exist for runtime config updates
        assert!(result.contains("recv('config',"));
        assert!(result.contains("Object.assign(_data, msg.payload)"));
    }

    #[test]
    fn test_preamble_has_16ms_batch_flush() {
        let result = generate("s", "{}");
        // Batch flush with 16ms debounce (approx 1 frame)
        assert!(result.contains("setTimeout(_flush, 16)"));
        // Timer guard: only schedule if no pending timer
        assert!(result.contains("if (!_timer)"));
    }

    #[test]
    fn test_preamble_sends_whale_marker_in_patch() {
        let result = generate("myStore", "{}");
        // The send() call must include __whale: true for bridge.rs to recognize it
        assert!(result.contains("send({ __whale: true, store: 'myStore', patch })"));
    }

    #[test]
    fn test_preamble_dirty_set_tracking() {
        let result = generate("s", "{}");
        // Uses a Set to track dirty keys
        assert!(result.contains("const _dirty = new Set()"));
        assert!(result.contains("_dirty.add(k)"));
        assert!(result.contains("_dirty.clear()"));
    }

    #[test]
    fn test_preamble_is_iife() {
        let result = generate("s", "{}");
        // Must be an IIFE to avoid polluting global scope
        assert!(result.starts_with("const __s__ = (() => {"));
        assert!(result.ends_with("})();"));
    }

    #[test]
    fn test_preamble_proxy_set_method() {
        let result = generate("s", "{}");
        // Proxy provides a .set(k, v) method
        assert!(result.contains("if (key === 'set')"));
        assert!(result.contains("return (k, v) =>"));
        assert!(result.contains("target[k] = v"));
    }

    #[test]
    fn test_preamble_different_store_names() {
        let names = ["alpha", "beta_store", "myGame123"];
        for name in names {
            let result = generate(name, "{}");
            assert!(
                result.contains(&format!("store: '{}'", name)),
                "store name '{}' should appear in send()",
                name
            );
        }
    }

    #[test]
    fn test_preamble_normalizes_invalid_identifier_chars() {
        let result = generate("my-store.v1", "{}");
        assert!(result.starts_with("const __my_store_v1__ = (() => {"));
        assert!(result.contains("store: 'my-store.v1'"));
    }

    #[test]
    fn test_preamble_uses_fallback_name_for_empty_store() {
        let result = generate("", "{}");
        assert!(result.starts_with("const __store__ = (() => {"));
    }

    #[test]
    fn test_preamble_complex_initial_state() {
        let state = r#"{"nested":{"a":1},"arr":[1,2,3],"str":"hello"}"#;
        let result = generate("complex", state);
        assert!(result.contains(state));
    }
}
