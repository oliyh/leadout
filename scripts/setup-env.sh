#!/usr/bin/env bash
# Sets up the Leadout development environment on Ubuntu 24.04.
# Safe to re-run — all steps are idempotent.
set -euo pipefail

SDK_VERSION="9.1.0"
SDK_DATE="2026-03-09"
SDK_HASH="6a872a80b"
SDK_NAME="connectiq-sdk-lin-${SDK_VERSION}"
SDK_DIR="$HOME/.Garmin/ConnectIQ/Sdks/${SDK_NAME}"
SDK_URL="https://developer.garmin.com/downloads/connect-iq/sdks/connectiq-sdk-lin-${SDK_VERSION}-${SDK_DATE}-${SDK_HASH}.zip"

LIBXML_URL="http://launchpadlibrarian.net/714702232/libxml2_2.9.13+dfsg-1ubuntu0.4_amd64.deb"
LIBXML_SO="libxml2.so.2.9.13"

echo "==> Installing system packages"
sudo apt-get install -y openjdk-21-jdk libmanette-0.2-0 grim imagemagick x11-utils xdotool ydotool

echo "==> Installing Monkey C VS Code extension"
code --install-extension garmin.monkey-c || echo "    (skipped — VS Code not on PATH)"

echo "==> Downloading Connect IQ SDK ${SDK_VERSION}"
mkdir -p "$HOME/.Garmin/ConnectIQ/Sdks"
if [ ! -d "$SDK_DIR" ]; then
    curl -L --progress-bar -o "/tmp/connectiq-sdk-${SDK_VERSION}.zip" "$SDK_URL"
    unzip -q "/tmp/connectiq-sdk-${SDK_VERSION}.zip" -d "$SDK_DIR"
    echo "    Extracted to $SDK_DIR"
else
    echo "    Already present, skipping"
fi

echo "==> Configuring SDK path"
echo "$SDK_DIR" > "$HOME/.Garmin/ConnectIQ/current-sdk.cfg"
ln -sfn "$SDK_DIR" "$HOME/.Garmin/ConnectIQ/Sdks/current"

echo "==> Installing libxml2 2.9.x (Ubuntu 24.04 workaround)"
mkdir -p "$HOME/.local/lib"
if [ ! -f "$HOME/.local/lib/$LIBXML_SO" ]; then
    curl -L --progress-bar "$LIBXML_URL" -o /tmp/libxml2-old.deb
    dpkg-deb -x /tmp/libxml2-old.deb /tmp/libxml2-old
    cp /tmp/libxml2-old/usr/lib/x86_64-linux-gnu/$LIBXML_SO "$HOME/.local/lib/"
    echo "    Installed $LIBXML_SO"
else
    echo "    Already present, skipping"
fi
ln -sf "$HOME/.local/lib/$LIBXML_SO" "$HOME/.local/lib/libxml2.so.2"

echo "==> Installing simulator and monkeydo wrapper scripts"
mkdir -p "$HOME/.local/bin"
cat > "$HOME/.local/bin/ciq-simulator" << 'EOF'
#!/bin/bash
exec env LD_LIBRARY_PATH="$HOME/.local/lib:$LD_LIBRARY_PATH" \
    "$HOME/.Garmin/ConnectIQ/Sdks/current/bin/simulator" "$@"
EOF
cat > "$HOME/.local/bin/ciq-run" << 'EOF'
#!/bin/bash
exec env LD_LIBRARY_PATH="$HOME/.local/lib:$LD_LIBRARY_PATH" \
    "$HOME/.Garmin/ConnectIQ/Sdks/current/bin/monkeydo" "$@"
EOF
chmod +x "$HOME/.local/bin/ciq-simulator" "$HOME/.local/bin/ciq-run"

echo "==> Configuring ydotool (evdev-based input for simulator automation)"
if ! groups | grep -q '\binput\b'; then
    sudo usermod -aG input "$USER"
    echo "    Added $USER to 'input' group — log out and back in for this to take effect"
else
    echo "    Already in 'input' group"
fi
sudo chown root:input /dev/uinput
sudo chmod 0660 /dev/uinput
echo "    /dev/uinput permissions set (effective immediately)"

echo "==> Ensuring ~/.local/bin is on PATH"
PROFILE="$HOME/.bashrc"
if ! grep -q 'local/bin' "$PROFILE" 2>/dev/null; then
    echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$PROFILE"
    echo "    Added to $PROFILE — restart your shell or run: source $PROFILE"
else
    echo "    Already in $PROFILE"
fi

echo ""
echo "Done. Two manual steps remain:"
echo ""
echo "  1. Generate a developer key (required to build):"
echo "     VS Code → Ctrl+Shift+P → 'Monkey C: Generate Developer Key'"
echo "     Save to: \$HOME/dev/garmin-developer/developer_key"
echo ""
echo "  2. Set VS Code settings (Ctrl+,):"
echo "     monkeyC.javaPath        = /usr/lib/jvm/java-21-openjdk-amd64"
echo "     monkeyC.developerKeyPath = <path to developer key>"
