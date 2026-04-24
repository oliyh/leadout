# from 
FROM ubuntu:22.04
ARG ARG_USER
ARG ARG_UID
ARG ARG_HOME
# Set non-interactive frontend for apt to avoid prompts
ENV DEBIAN_FRONTEND=noninteractive
# Install dependencies for Garmin Connect IQ SDK Manager and X11/XWayland
RUN apt update && apt install -y \
    libwebkit2gtk-4.0-37 \
    libgtk-3-0 \
    libcanberra-gtk3-module \
    wget \
    curl \
    jq \
    unzip \
    libsm6 \
    xauth \
    x11-apps \
    && rm -rf /var/lib/apt/lists/*
# Create non-root user with UID and home directory
RUN useradd -u ${ARG_UID} -m -s /bin/bash ${ARG_USER} \
    && mkdir -p ${ARG_HOME}/.Garmin/ConnectIQ \
    && chown -R ${ARG_USER}:${ARG_USER} ${ARG_HOME}/.Garmin \
    && chmod -R 775 ${ARG_HOME}/.Garmin
# Download and extract Garmin Connect IQ SDK Manager to /opt/garmin
RUN wget -q --tries=3 --timeout=30 https://developer.garmin.com/downloads/connect-iq/sdk-manager/connectiq-sdk-manager-linux.zip -O /tmp/connectiq-sdk-manager-linux.zip \
    && if [ ! -s /tmp/connectiq-sdk-manager-linux.zip ]; then echo "Download failed"; exit 1; fi \
    && unzip /tmp/connectiq-sdk-manager-linux.zip -d /opt/garmin \
    && if [ ! -f /opt/garmin/bin/sdkmanager ]; then echo "SDK Manager not found after unzip"; exit 1; fi \
    && chmod +x /opt/garmin/bin/sdkmanager \
    && rm /tmp/connectiq-sdk-manager-linux.zip
# Set environment variables for X11/XWayland and WebKit
ENV DISPLAY=:0
ENV XAUTHORITY=${ARG_HOME}/.Xauthority
ENV WEBKIT_DISABLE_DMABUF_RENDERER=1
ENV WEBKIT_DISABLE_COMPOSITING_MODE=1
ENV HOME=${ARG_HOME}
# Set working directory for SDK data
WORKDIR ${ARG_HOME}/.Garmin
# Switch to non-root user
USER ${ARG_USER}
# Run the SDK Manager
CMD ["/opt/garmin/bin/sdkmanager"]