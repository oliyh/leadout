JAVA        := /usr/lib/jvm/java-21-openjdk-amd64/bin/java
SDK_JAR     := $(HOME)/.Garmin/ConnectIQ/Sdks/current/bin/monkeybrains.jar
MONKEYDO    := $(HOME)/.Garmin/ConnectIQ/Sdks/current/bin/monkeydo
DEV_KEY     := $(HOME)/dev/garmin-developer/developer_key
DATAFIELD   := datafield/leadout-datafield
PRG         := $(DATAFIELD)/bin/leadoutdatafield.prg
PRG_TEST    := $(DATAFIELD)/bin/leadoutdatafield-test.prg
PRG_SIM     := $(DATAFIELD)/bin/leadoutdatafield-sim.prg
PRG_RELEASE := $(DATAFIELD)/bin/leadoutdatafield.iq
DEVICE      := fr265s
DEVICE_SIM  := fr265s_sim
WATCH_MTP   := $(shell gio mount -l 2>/dev/null | grep -o 'mtp://[^ ]*' | head -1)
WATCH_APPS  := $(WATCH_MTP)Internal Storage/GARMIN/Apps

.PHONY: env datafield datafield-sim datafield-test datafield-release datafield-run-tests install-datafield uninstall-datafield \
        sim sim-lap sim-screenshot \
        ui-install ui-dev ui-build server-install server-start server-dev server-test dev

env:
	scripts/setup-env.sh

# ======== Datafield ==========

datafield:
	$(JAVA) -Xms1g \
		-Dfile.encoding=UTF-8 \
		-Dapple.awt.UIElement=true \
		-jar $(SDK_JAR) \
		-o $(PRG) \
		-f $(DATAFIELD)/monkey-device.jungle \
		-y $(DEV_KEY) \
		-d $(DEVICE) -w

datafield-sim:
	$(JAVA) -Xms1g \
		-Dfile.encoding=UTF-8 \
		-Dapple.awt.UIElement=true \
		-jar $(SDK_JAR) \
		-o $(PRG_SIM) \
		-f $(DATAFIELD)/monkey-sim.jungle \
		-y $(DEV_KEY) \
		-d $(DEVICE_SIM) -w

datafield-test:
	$(JAVA) -Xms1g \
		-Dfile.encoding=UTF-8 \
		-Dapple.awt.UIElement=true \
		-jar $(SDK_JAR) \
		-o $(PRG_TEST) \
		-f $(DATAFIELD)/monkey-sim.jungle \
		-y $(DEV_KEY) \
		-d $(DEVICE_SIM) \
		--unit-test -w

datafield-release:
	$(JAVA) -Xms1g \
		-Dfile.encoding=UTF-8 \
		-Dapple.awt.UIElement=true \
		-jar $(SDK_JAR) \
		-o $(PRG_RELEASE) \
		-f $(DATAFIELD)/monkey-device.jungle \
		-y $(DEV_KEY) \
		--package-app

# Build test binary then run it via monkeydo against the simulator.
# Starts the simulator automatically if not already running.
# monkeydo exits non-zero even on success, so we detect pass/fail from output.
datafield-run-tests: datafield-test
	@if ! pgrep -x simulator > /dev/null; then \
	    echo "Starting simulator..."; \
	    DISPLAY=:0 GDK_BACKEND=x11 ciq-simulator & \
	    sleep 6; \
	fi
	@$(MONKEYDO) $(PRG_TEST) $(DEVICE) -t 2>&1 | tee /tmp/datafield-test-results.txt; \
	grep -q "^PASSED" /tmp/datafield-test-results.txt

# Installs datafield on a watch connected via usb
install-datafield: datafield
	@test -n "$(WATCH_MTP)" || (echo "No MTP device found — is the watch plugged in?"; exit 1)
	gio copy -p "file://$(PWD)/$(PRG)" "$(WATCH_APPS)/"

# Removes the datafield from a watch connected via usb
uninstall-datafield:
	@test -n "$(WATCH_MTP)" || (echo "No MTP device found — is the watch plugged in?"; exit 1)
	gio trash "$(WATCH_APPS)/leadoutdatafield.prg" 2>/dev/null || \
	    gio remove "$(WATCH_APPS)/leadoutdatafield.prg" 2>/dev/null || \
	    (echo "App not found on watch — may already be removed"; exit 0)

sim-screenshot:
	scripts/sim-screenshot.sh ./tmp/sim.png

sim: datafield-sim
	scripts/sim-start.sh "$(abspath $(PRG_SIM))" $(DEVICE)

# doesn't work
sim-lap:
	scripts/sim-button.sh esc

# ======== UI ==========

ui-install:
	cd ui && npm install

ui-dev: ui-install
	cd ui && npm run dev

ui-build: ui-install
	cd ui && npm run build && cd .. && rm -rf server/public && cp -r ui/dist server/public

# ======== Server ==========

server-install:
	cd server && npm install

server-start: server-install
	cd server && npm start

server-dev: server-install
	cd server && npm run dev

server-test: server-install
	cd server && npm test

# Run API server + Vite together; Ctrl-C stops both
dev: server-install ui-install
	@trap 'kill 0' INT; \
	  (cd server && npm run dev) & \
	  (cd ui && npm run dev) & \
	  wait