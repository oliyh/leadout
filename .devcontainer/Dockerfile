FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV SDK_VERSION=9.1.0
ENV SDK_HOME=/root/.Garmin/ConnectIQ/Sdks

# System packages: Java 21, X11/GUI libs for simulator, tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-21-jdk \
    ca-certificates curl wget unzip jq git make python3 \
    libxml2 libsm6 libice6 \
    libsecret-1-0 libusb-1.0-0 libxkbcommon0 libmanette-0.2-0 \
    libgtk-3-0 libwebkit2gtk-4.0-37 libsoup2.4-1 libjavascriptcoregtk-4.0-18 \
    x11-utils xdotool ydotool imagemagick \
    && rm -rf /var/lib/apt/lists/*

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

# Simulator and runner wrappers (mirrors setup-env.sh)
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
