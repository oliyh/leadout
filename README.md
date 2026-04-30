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


## Future work
- How much can be built / tested in github actions?
- devcontainer to install all the sdk stuff in? can stil run the sim somehow?
- needs to work better on mobile
- postgres on coolify? need to dump out a backup regularly


## Todo

- add a privacy page at /privacy which explains how data is used (and how it is anonymous)
- backend server dies if database op blows up, doesn't recover e.g.:
```
file:///home/oliy/dev/leadout/server/src/store/sqlite.js:119
        return this._db.prepare('DELETE FROM devices WHERE id = ?').run(id).changes > 0;
                                                                    ^
SqliteError: FOREIGN KEY constraint failed
    at SqliteStore.deleteDevice (file:///home/oliy/dev/leadout/server/src/store/sqlite.js:119:69)
    at file:///home/oliy/dev/leadout/server/app.js:89:21
    at process.processTicksAndRejections (node:internal/process/task_queues:95:5) {
  code: 'SQLITE_CONSTRAINT_FOREIGNKEY'
}
```

- separate pages to show 1. channels 2. devices 3. subscriptions
- clicking anywhere on a programme should take you to the edit screen
- ensure FONT_XTINY labels in watch view are consistently 10px offset from text underneath them
- display pace in user's pref - miles or km. convert as necessary. can we read this from watch?
- server could capture user's unit preference when device registers, and display all numbers in their preferred
- join link doesn't work - should land you on your subscriptions page, listing all your subs, and highlight the newly joined one
- prefilled code on register page opened from watch still doesn't work
- partnumber can be looked up here: https://apps.garmin.com/api/appsLibraryExternalServices/api/asw/deviceTypes - do it on the server for rendering?

- had to comment out L508 of datafield test
- settings file to nuke storage and state? currently stuck in unable to sync (and it references widget which doesnt exist)

- makefile recipe to completely remove it from watch
- totally empty sidebar when you set up a new account, looks a bit silly
- device code still not populated on register page opened from watch
- it also doesnt make you login first, so you just get account not recognised
- even though we can't programatically interact with the sim, we can check the log output - a successful startup looks like this (can add the registration too) and subscribe / add & update programmes, deregister watch - should see it all flow through - and take screenshots too (make sim-screenshot) and compare them to expected screenshots
```
Device code=ABC123
loadProgramme: name=Sprintervals blocks=1
onSyncResponse: code=200
loadProgramme: name=Sprintervals blocks=1
Background: onSyncResponse: code=200
loadProgramme: name=Sprintervals v2 blocks=1
```
- "register another" and "new channel" could be ghost entries below the devices and channels lists,
  and when on a channel page, possibly do the same with "New programme"
- adding a channel should use a modal dialogue. after submitting modal should take you straight to the channel screen
- when editing a programme, the url doesn't change from the channel url
- subscriber should be able to view programme in readonly mode to see what it involves
- clicking the programme from the subs section in the sidebar should navigate to this programme readonly view
- have a page for my devices, linked from the navbar. this should be a simple list, same as on home page - in fact we can still have the three main sections as their own pages, and reuse the list components on the homepage
- register another device goes to register page which is "outside" the site. it should open a modal with the register page in it
- pages should fetch their own data, not rely on other things loading it for them (openExternalProgramme)
- watch display when there is a pace target - we lose the next block. is there room?
- what does interim page between blocks look like?
- when editing segment should not have to press "save" button, it should autosave
- more templates - 321 fartlek, mona fartlek
- page width 800 everywhere except programme editor (and programme view) where more room is needed
- pyramid template is wrong - work should pyramid up and down, rest should be constant (another param)

