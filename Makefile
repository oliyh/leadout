JAVA        := /usr/lib/jvm/java-21-openjdk-amd64/bin/java
SDK_JAR     := $(HOME)/.Garmin/ConnectIQ/Sdks/current/bin/monkeybrains.jar
DEV_KEY     := $(HOME)/dev/garmin-developer/developer_key
DATAFIELD   := datafield/leadout-datafield
PRG         := $(DATAFIELD)/bin/leadoutdatafield.prg
DEVICE      := fr265s
DEVICE_SIM  := fr265s_sim
PRG_SIM     := $(DATAFIELD)/bin/leadoutdatafield-sim.prg
WATCH_MTP   := $(shell gio mount -l 2>/dev/null | grep -o 'mtp://[^ ]*' | head -1)
WATCH_APPS  := $(WATCH_MTP)Internal Storage/GARMIN/Apps

.PHONY: env datafield datafield-sim install-datafield sim sim-lap screenshot

env:
	scripts/setup-env.sh


datafield:
	$(JAVA) -Xms1g \
		-Dfile.encoding=UTF-8 \
		-Dapple.awt.UIElement=true \
		-jar $(SDK_JAR) \
		-o $(PRG) \
		-f $(DATAFIELD)/monkey.jungle \
		-y $(DEV_KEY) \
		-d $(DEVICE) -w

datafield-sim:
	$(JAVA) -Xms1g \
		-Dfile.encoding=UTF-8 \
		-Dapple.awt.UIElement=true \
		-jar $(SDK_JAR) \
		-o $(PRG_SIM) \
		-f $(DATAFIELD)/monkey.jungle \
		-y $(DEV_KEY) \
		-d $(DEVICE_SIM) -w

install-datafield: datafield
	@test -n "$(WATCH_MTP)" || (echo "No MTP device found — is the watch plugged in?"; exit 1)
	gio copy -p "file://$(PWD)/$(PRG)" "$(WATCH_APPS)/"

screenshot:
	scripts/sim-screenshot.sh /tmp/sim.png

sim: datafield-sim
	scripts/sim-start.sh "$(abspath $(PRG_SIM))" $(DEVICE)

sim-lap:
	scripts/sim-button.sh esc
