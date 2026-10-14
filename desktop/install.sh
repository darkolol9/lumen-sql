#!/usr/bin/env bash
# Installs the built AppImage for the current user and adds it to the app launcher.
#   desktop/install.sh                 install / update
#   desktop/install.sh --import-data   also copy this checkout's data/ (connections, worksheets, history)
#                                      into the desktop app, if it doesn't have data of its own yet
set -euo pipefail
cd "$(dirname "$0")/.."

appimage=$(ls -t dist-desktop/release/lumen-sql-*.AppImage 2>/dev/null | head -1)
[[ -n "$appimage" ]] || { echo "No AppImage found: run 'pnpm build:desktop' first" >&2; exit 1; }

dest="$HOME/.local/opt/lumen-sql"
mkdir -p "$dest" "$HOME/.local/share/applications" "$HOME/.local/share/icons/hicolor/512x512/apps"
install -m 755 "$appimage" "$dest/lumen-sql.AppImage"
install -m 644 desktop/icon.png "$HOME/.local/share/icons/hicolor/512x512/apps/lumen-sql.png"

cat > "$HOME/.local/share/applications/lumen-sql.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Lumen SQL
Comment=SQL workbench for MySQL, Snowflake and ClickHouse
Exec="$dest/lumen-sql.AppImage" %U
Icon=lumen-sql
Terminal=false
Categories=Development;Database;
StartupWMClass=lumen-sql
DESKTOP
update-desktop-database "$HOME/.local/share/applications" 2>/dev/null || true
echo "Installed $dest/lumen-sql.AppImage"

if [[ "${1:-}" == "--import-data" ]]; then
  target="$HOME/.config/Lumen SQL/data"
  if [[ -e "$target/lumen.json" ]]; then
    echo "Skipped data import: $target already has data"
  else
    # secrets in lumen.json are encrypted with .secret.key, so the two must travel together
    mkdir -p "$target" && chmod 700 "$target"
    install -m 600 data/lumen.json data/.secret.key "$target/"
    echo "Imported data/ into $target"
  fi
fi
