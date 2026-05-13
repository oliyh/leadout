# Leadout

Group interval training app for Garmin smartwatches.

See `CLAUDE.md` for the full project brief.

---

## Development environment setup (Ubuntu 24.04)

### Prerequisites

- VS Code
- `sudo` access (for apt packages)

### Automated setup

```bash
make env
```

This installs all dependencies and configures the toolchain. It is safe to re-run.

What it does:
- Installs `openjdk-21-jdk`, `libmanette-0.2-0`, `imagemagick`, `xdotool`, `ydotool` via apt
- Installs the Monkey C VS Code extension
- Downloads and extracts the Connect IQ SDK 9.1.0
- Writes `~/.Garmin/ConnectIQ/current-sdk.cfg` and `Sdks/current` symlink
- Downloads libxml2 2.9.x from the Ubuntu 22.04 archive into `~/.local/lib` (Ubuntu 24.04 ships libxml2.so.16 which the Garmin toolchain cannot use)
- Writes `~/.local/bin/ciq-simulator` and `~/.local/bin/ciq-run` wrapper scripts with the correct `LD_LIBRARY_PATH`
- Adds `~/.local/bin` to `PATH` in `~/.bashrc` if not already present
- Adds your user to the `input` group and sets `/dev/uinput` permissions for ydotool (log out/in required once for the group change)

### Manual steps (one-time, after `make env`)

**1. Generate a developer key**

`Ctrl+Shift+P` → `Monkey C: Generate Developer Key`

Save to a stable location, e.g. `~/dev/garmin-developer/developer_key`. This key signs your builds — keep it safe and do not commit it.

**2. Configure VS Code settings**

Open VS Code settings (`Ctrl+,`) and set:

| Setting | Value |
|---|---|
| `monkeyC.javaPath` | `/usr/lib/jvm/java-21-openjdk-amd64` |
| `monkeyC.developerKeyPath` | path to your developer key |

---

## Building and running

### Build for watch

```bash
make datafield
```

### Install to physical watch

Plug in the FR265s via USB, then:

```bash
make install-datafield
```

### Run in simulator

```bash
make sim
```

Starts the simulator if not already running, builds for the simulator device profile, and pushes the app. The data field shows "Track / Press LAP to start".

```bash
make sim-lap      # press the back/LAP button to start the interval session
make sim-screenshot   # capture simulator window to ./tmp/sim.png
```

---

## Project structure

```
leadout/
├── CLAUDE.md                   # Project brief and architecture
├── Makefile                    # Build, install, simulator targets
├── scripts/
│   └── setup-env.sh            # Environment setup (run via make env)
├── datafield/
│   └── leadout-datafield/      # Connect IQ Data Field app (Monkey C)
│       ├── manifest.xml
│       ├── monkey.jungle
│       └── source/
│           ├── leadout-datafieldApp.mc
│           ├── leadout-datafieldBackground.mc
│           └── leadout-datafieldView.mc
└── spec/
    └── leadout.allium          # Allium behavioural specification
```

## Release
See [GARMIN_STORE](./GARMIN_STORE.md)

## Future work
- can the sim run in the devcontainer and interact with it?
- postgres on coolify - backup regularly


## Todo

### server / UI
- layout on watch screens
- even though we can't programatically interact with the sim, we can check the log output - a successful startup looks like this (can add the registration too) and subscribe / add & update programmes, deregister watch - should see it all flow through - and take screenshots too (make sim-screenshot works) and compare them to expected screenshots
```
Device code=ABC123
loadProgramme: name=Sprintervals blocks=1
onSyncResponse: code=200
loadProgramme: name=Sprintervals blocks=1
Background: onSyncResponse: code=200
loadProgramme: name=Sprintervals v2 blocks=1
```

- can datafield display 'update required' if, when it syncs, the server says you need to upgrade

- "register another" and "new channel" could be ghost entries below the devices and channels lists,
  and when on a channel page, possibly do the same with "New programme" - ask me about this

- watch display when there is a pace target - we lose the 'next' block. is there room?

- pyramid should be able to parameterise the rest period length
- other templates - should be more parameterisable (params can be defaulted though)
- should still be able to view programmes from the past

- sdk 3.3 support
- i made "isOldSdk" background tagged - maybe we can put stuff back in onStart, and see if background service is happy again
- still get  compile warning about the lap thing
- when it has a programme - even a modest one - it runs out of memory :cry: can we compress it somehow, or load it one block at a time?

is foreground sync loop really a loop? it seems to try once and then give up...

- segments, blocks and programmes shold also show distance estimate alongside time estimate using conversion logic

- geo gate that you have to go through to complete a segment, instead of completing a distance or a time

- diagram on home page explaining instructor -> channel -> subscription -> participant watch