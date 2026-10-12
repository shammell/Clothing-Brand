from app.core.config import DEFAULT_DEV_ORIGINS, build_allowed_origins


def test_build_allowed_origins_empty_returns_dev_defaults():
    assert build_allowed_origins("") == DEFAULT_DEV_ORIGINS


def test_build_allowed_origins_merges_extra():
    result = build_allowed_origins("https://clothing-store-sky-codein.vercel.app, https://example.com")
    assert "https://clothing-store-sky-codein.vercel.app" in result
    assert "https://example.com" in result
    assert set(DEFAULT_DEV_ORIGINS).issubset(set(result))


def test_build_allowed_origins_ignores_blank_entries():
    result = build_allowed_origins("https://example.com, , ")
    assert result.count("https://example.com") == 1
    assert "" not in result
