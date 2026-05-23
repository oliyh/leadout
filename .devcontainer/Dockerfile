FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV SDK_VERSION=9.1.0
ENV SDK_HOME=/root/.Garmin/ConnectIQ/Sdks

# System packages: Java 21, X11/GUI libs for simulator, tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-21-jdk \
    ca-certificates curl wget unzip jq git make python3 openssh-client \
    libxml2 libsm6 libice6 \
    libsecret-1-0 libusb-1.0-0 libxkbcommon0 libmanette-0.2-0 \
    libgtk-3-0 libwebkit2gtk-4.0-37 libsoup2.4-1 libjavascriptcoregtk-4.0-18 \
    x11-utils xdotool ydotool imagemagick \
    fonts-roboto \
    && rm -rf /var/lib/apt/lists/*

# Roboto font for CIQ simulator — it crashes with a null-deref if this is missing
RUN mkdir -p /root/.Garmin/ConnectIQ/Fonts \
    && cp /usr/share/fonts/truetype/roboto/unhinted/RobotoTTF/Roboto-Regular.ttf \
          /root/.Garmin/ConnectIQ/Fonts/

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Connect IQ SDK
RUN SDK_FILE=$(curl -s https://developer.garmin.com/downloads/connect-iq/sdks/sdks.json \
      | jq -r --arg v "$SDK_VERSION" '.[] | select(.version==$v) | .linux') \
    && wget -q "https://developer.garmin.com/downloads/connect-iq/sdks/${SDK_FILE}" -O /tmp/ciq.zip \
    && mkdir -p "$SDK_HOME/connectiq-sdk-lin-${SDK_VERSION}" \
    && unzip -q /tmp/ciq.zip -d "$SDK_HOME/connectiq-sdk-lin-${SDK_VERSION}" \
    && rm /tmp/ciq.zip \
    && ln -s "$SDK_HOME/connectiq-sdk-lin-${SDK_VERSION}" "$SDK_HOME/current" \
    && echo "$SDK_HOME/connectiq-sdk-lin-${SDK_VERSION}" > /root/.Garmin/ConnectIQ/current-sdk.cfg

# Device definitions (community package — avoids SDK Manager + Garmin login)
RUN mkdir -p /root/.Garmin/ConnectIQ/Devices \
    && wget -q "https://raw.githubusercontent.com/matco/connectiq-tester/master/devices.zip" -O /tmp/devices.zip \
    && unzip -q /tmp/devices.zip -d /root/.Garmin/ConnectIQ/Devices \
    && rm /tmp/devices.zip

# Patch older device simulator.json files that reference proprietary .cft font
# files (e.g. FNT_FR945_*.cft) which are only distributed by the official
# Garmin SDK Manager and not included in the community devices.zip.
# Newer devices (FR265S, etc.) already use Roboto-Regular natively; older ones
# (FR245, FR935, etc.) need every missing font reference swapped to Roboto-Regular.
COPY scripts/patch-device-fonts.py /tmp/patch-device-fonts.py
RUN python3 /tmp/patch-device-fonts.py && rm /tmp/patch-device-fonts.py

# Simulator and runner wrappers
RUN mkdir -p /root/.local/bin \
    && printf '#!/bin/bash\nexec "%s/current/bin/simulator" "$@"\n' "$SDK_HOME" \
       > /root/.local/bin/ciq-simulator \
    && printf '#!/bin/bash\nexec "%s/current/bin/monkeydo" "$@"\n' "$SDK_HOME" \
       > /root/.local/bin/ciq-run \
    && chmod +x /root/.local/bin/ciq-simulator /root/.local/bin/ciq-run

# ydotool needs the input group
RUN groupadd -f input && usermod -aG input root

ENV PATH="/root/.local/bin:$PATH"

# Playwright + headless Chromium (--with-deps installs all required system libraries)
RUN npx -y playwright install --with-deps chromium
