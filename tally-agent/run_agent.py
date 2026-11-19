"""Entry point for the packaged .exe (PyInstaller cannot run a package's __main__.py that uses relative imports)."""
from tally_agent.cli import main

if __name__ == "__main__":
    raise SystemExit(main())
