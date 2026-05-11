"""CrewAI MCPServerAdapter helpers for GhostCrab Personal."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from mcp import StdioServerParameters


def ghostcrab_stdio_server_params() -> "StdioServerParameters":
    """Return stdio parameters that start the local GhostCrab Personal server."""
    try:
        from mcp import StdioServerParameters
    except ImportError as exc:
        raise ImportError(
            "The 'mcp' package is required for GhostCrab stdio transport. "
            "Install it with: pip install mcp"
        ) from exc

    return StdioServerParameters(command="gcp", args=["brain", "up"])
