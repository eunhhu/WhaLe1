/// __whale_store__ 프리앰블 생성
/// Frida 스크립트에 자동 삽입되어 in-process 상태 접근을 제공
pub fn generate(store_name: &str, initial_state_json: &str) -> String {
    format!(
        r#"const __whale_store__ = (() => {{
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
        initial_state = initial_state_json,
        store_name = store_name,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_preamble_contains_store_name() {
        let result = generate("trainer", r#"{"speed":1.0}"#);
        assert!(result.contains("trainer"));
        assert!(result.contains(r#"{"speed":1.0}"#));
        assert!(result.contains("__whale_store__"));
        assert!(result.contains("__whale: true"));
    }

    #[test]
    fn test_preamble_has_proxy() {
        let result = generate("test", "{}");
        assert!(result.contains("new Proxy"));
        assert!(result.contains("recv('config'"));
        assert!(result.contains("setTimeout(_flush, 16)"));
    }
}
