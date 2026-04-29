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
make screenshot   # capture simulator window to /tmp/sim.png
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


## Future work
- How much can be built / tested in github actions?
- devcontainer to install all the sdk stuff in? can stil run the sim somehow?
- needs to work better on mobile
- postgres on coolify? need to dump out a backup regularly


## Todo

- separate pages to show 1. channels 2. devices 3. subscriptions
- clicking anywhere on a programme should take you to the edit screen

- join link doesn't work - should land you on your subscriptions page, listing all your subs, and highlight the newly joined one
- prefilled code on register page opened from watch still doesn't work
- partnumber can be looked up here: https://apps.garmin.com/api/appsLibraryExternalServices/api/asw/deviceTypes - do it on the server for rendering?

- had to comment out L508 of datafield test
- settings file to nuke storage and state? currently stuck in unable to sync (and it references widget which doesnt exist)

- makefile recipe to completely remove it from watch
- totally empty sidebar when you set up a new account, looks a bit silly
- register popup doesnt make you login first, so you just get account not recognised
- is it background syncing?
