FROM ghcr.io/matco/connectiq-tester@sha256:64958e8fd2925d0c4986d72a9aa9d8e2101297a881354aab0118be2f1dc22105 AS ciq-devices

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

# Device definitions are copied from matco/connectiq-tester's public image. Its repo no longer
# ships devices.zip (removed 2026-09-01) and the separate resources image
# (ghcr.io/matco/connectiq-tester-resources) requires auth, but the tester image itself pulls anonymously.
# Pinned by digest for reproducibility; to update, run `docker pull ghcr.io/matco/connectiq-tester:latest`
# and take the new digest from the output.
COPY --from=ciq-devices /root/.Garmin/ConnectIQ/Devices /root/.Garmin/ConnectIQ/Devices

# Throw-away key for test builds — not used for publishing
RUN openssl genrsa -out /tmp/key.pem 4096 \
    && openssl pkcs8 -topk8 -inform PEM -outform DER -in /tmp/key.pem -out /opt/developer.der -nocrypt \
    && rm /tmp/key.pem

ENV PATH="$CIQ_SDK/bin:$PATH"

COPY run-tests.sh /usr/local/bin/run-tests
RUN chmod +x /usr/local/bin/run-tests

WORKDIR /workspace
CMD ["run-tests"]
