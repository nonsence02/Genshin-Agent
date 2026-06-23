from experiments.genshin_py.run_genshin_py_experiment import build_config, parse_cookie_string
from experiments.genshin_py.sanitize_output import sanitize_output


def test_cookie_string_parsing():
    assert parse_cookie_string("ltuid_v2=1; ltoken_v2=secret; cookie_token_v2=token") == {
        "ltuid_v2": "1",
        "ltoken_v2": "secret",
        "cookie_token_v2": "token",
    }


def test_env_mapping_without_exposing_secrets():
    config = build_config(
        {
            "GENSHIN_UID": "711328650",
            "LTUID_V2": "1",
            "LTOKEN_V2": "secret",
            "COOKIE_TOKEN_V2": "token",
        },
        [".env"],
    )
    diagnostic = {
        "uid_present": bool(config["uid"]),
        "ltuid_v2_present": config["ltuid_v2_present"],
        "ltoken_v2_present": config["ltoken_v2_present"],
        "cookie_token_v2_present": config["cookie_token_v2_present"],
    }

    assert diagnostic == {
        "uid_present": True,
        "ltuid_v2_present": True,
        "ltoken_v2_present": True,
        "cookie_token_v2_present": True,
    }
    assert "secret" not in str(diagnostic)


def test_full_cookie_mapping():
    config = build_config(
        {
            "HOYOAPI_COOKIE": "ltuid_v2=1; ltoken_v2=secret; cookie_token_v2=token",
        },
        [],
    )

    assert config["full_cookie_parsed"] is True
    assert config["ltuid_v2_present"] is True
    assert config["ltoken_v2_present"] is True
    assert config["cookie_token_v2_present"] is True


def test_sanitizer_redacts_tokens_and_cookie_strings():
    sanitized = sanitize_output(
        {
            "ltoken_v2": "secret",
            "nested": {"cookie": "ltuid=1; ltoken=secret"},
            "safe": "Furina",
        }
    )

    assert sanitized == {
        "ltoken_v2": "[REDACTED]",
        "nested": {"cookie": "[REDACTED]"},
        "safe": "Furina",
    }
