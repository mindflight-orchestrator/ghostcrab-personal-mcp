from __future__ import annotations

from dataclasses import dataclass
import sys
import types

import pytest

from ghostcrab_crewai import ghostcrab_stdio_server_params


@dataclass
class FakeStdioServerParameters:
    command: str
    args: list[str]


def test_stdio_params(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_mcp = types.ModuleType("mcp")
    fake_mcp.StdioServerParameters = FakeStdioServerParameters
    monkeypatch.setitem(sys.modules, "mcp", fake_mcp)

    params = ghostcrab_stdio_server_params()

    assert params.command == "gcp"
    assert params.args == ["brain", "up"]


def test_stdio_params_missing_mcp(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delitem(sys.modules, "mcp", raising=False)
    monkeypatch.setitem(sys.modules, "mcp", None)

    with pytest.raises(ImportError, match="pip install mcp"):
        ghostcrab_stdio_server_params()
