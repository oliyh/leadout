FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV SDK_VERSION=9.1.0
ENV CIQ_SDK=/opt/connectiq

RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jre-headless \
    libxml2 \
    libsm6 \
    libice6 \
    xvfb \
    openssl \
    curl \
    wget \
    unzip \
    jq \
    git \
    libsecret-1-0 \
    libusb-1.0-0 \
    libxkbcommon0 \
    libgtk-3-0 \
    libwebkit2gtk-4.0-37 \
    libsoup2.4-1 \
    libjavascriptcoregtk-4.0-18 \
    && rm -rf /var/lib/apt/lists/*

RUN SDK_FILE=$(curl -s https://developer.garmin.com/downloads/connect-iq/sdks/sdks.json \
      | jq -r --arg v "$SDK_VERSION" '.[] | select(.version==$v) | .linux') \
    && wget -q "https://developer.garmin.com/downloads/connect-iq/sdks/${SDK_FILE}" -O /tmp/ciq.zip \
    && unzip -q /tmp/ciq.zip -d $CIQ_SDK \
    && rm /tmp/ciq.zip

RUN mkdir -p /root/.Garmin/ConnectIQ/Devices \
    && wget -q "https://raw.githubusercontent.com/matco/connectiq-tester/master/devices.zip" -O /tmp/devices.zip \
    && unzip -q /tmp/devices.zip -d /root/.Garmin/ConnectIQ/Devices \
    && rm /tmp/devices.zip

# Throw-away key for test builds — not used for publishing
RUN openssl genrsa -out /tmp/key.pem 4096 \
    && openssl pkcs8 -topk8 -inform PEM -outform DER -in /tmp/key.pem -out /opt/developer.der -nocrypt \
    && rm /tmp/key.pem

ENV PATH="$CIQ_SDK/bin:$PATH"

COPY run-tests.sh /usr/local/bin/run-tests
RUN chmod +x /usr/local/bin/run-tests

WORKDIR /workspace
CMD ["run-tests"]
