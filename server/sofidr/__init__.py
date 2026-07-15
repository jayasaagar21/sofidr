"""SOFIDR -- a working, leak-free reimplementation."""

from .framework import SOFIDRFramework, SOFIDRResult
from .terrain import analyze, Terrain, default_formation
from .sei import compute_sei, SEIResult
from .knowledge import KnowledgeBase
from .formations import FORMATIONS, get_all, describe, Formation

__all__ = [
    "SOFIDRFramework", "SOFIDRResult",
    "analyze", "Terrain", "default_formation",
    "compute_sei", "SEIResult",
    "KnowledgeBase",
    "FORMATIONS", "get_all", "describe", "Formation",
]

__version__ = "0.2.0"
