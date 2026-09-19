"""COOLDOWN_SECONDS garbage must not crash client at import."""

def test_cooldown_fallback_on_garbage(monkeypatch) -> None:
    import os
    monkeypatch.setenv("COOLDOWN_SECONDS", "abc");
    from rb_client.capture import _cooldown_seconds

    assert _cooldown_seconds() == 2.0
