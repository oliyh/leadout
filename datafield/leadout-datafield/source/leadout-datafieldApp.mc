import Toybox.Application;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

(:background)
class leadout_datafieldApp extends Application.AppBase {

    hidden var mView as leadout_datafieldView?;
    hidden var mDeviceCode as String = "";
    hidden var mWatchToken as String? = null;

    function initialize() {
        AppBase.initialize();
        // Stable per-device identifier — generated once, persisted forever.
        // Displayed on screen so the participant can register at /register.
        mDeviceCode = getOrCreateDeviceCode();
        var storedToken = Application.Storage.getValue("watch_token");
        mWatchToken = (storedToken instanceof String) ? storedToken as String : null;
        Background.registerForTemporalEvent(new Time.Duration(syncPeriodSeconds()));
    }

    function onStart(state as Dictionary?) as Void {
        // Intentionally empty. onStart runs in both foreground and background contexts, so
        // it is unsafe to call isOldSdk() or make web requests here. All startup logic that
        // needs the view or SDK detection is in getInitialView(), which is foreground-only.
    }

    function onStartTokenPoll(responseCode as Number, data as Dictionary?) as Void {
        logIfSimHttpsMisconfigured(responseCode);
        if (responseCode == 200 && data != null) {
            var token = data["token"];
            if (token instanceof String) {
                mWatchToken = token as String;
                Application.Storage.setValue("watch_token", mWatchToken);
            }
        }
        makeSyncRequest(mDeviceCode, mWatchToken, method(:onSyncResponse));
    }

    function onStop(state as Dictionary?) as Void {
    }

    function getServiceDelegate() as [System.ServiceDelegate] {
        return [new LeadoutServiceDelegate()];
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        // getInitialView is foreground-only — safe to call isOldSdk() and make web requests.
        var old = isOldSdk();
        Application.Storage.setValue("is_old_sdk", old);
        mView = new leadout_datafieldView();
        mView.setDeviceCode(mDeviceCode);
        if (old) {
            // Old SDK: foreground web requests unavailable; background service handles sync.
            // Show the device code immediately if not yet registered.
            if (mWatchToken == null) {
                mView.setRegistrationRequired(mDeviceCode);
                // Force 5-min background cadence so registration is detected promptly.
                // syncPeriodSeconds() will return 300 because is_old_sdk=true and no token.
                Background.registerForTemporalEvent(new Time.Duration(syncPeriodSeconds()));
            }
        } else {
            // New SDK: kick off a foreground sync so the view is populated without waiting
            // for the user to open the widget or the background service to fire.
            if (mWatchToken != null) {
                makeSyncRequest(mDeviceCode, mWatchToken, method(:onSyncResponse));
            } else {
                mView.setRegistrationRequired(mDeviceCode);
                makeTokenRequest(mDeviceCode, method(:onStartTokenPoll));
            }
        }
        return [mView];
    }

    // Called when the background temporal sync completes and passes back data.
    function onBackgroundData(data as Application.PersistableType) as Void {
        var view = mView;
        if (!(data instanceof Dictionary) || view == null) { return; }
        var dict = data as Dictionary;

        // The background service may have stored a token during the just-completed
        // registration+sync chain. Refresh mWatchToken and re-register the temporal
        // event so old-SDK devices switch off the 5-min registration-detection cadence.
        var newToken = Application.Storage.getValue("watch_token");
        if (newToken instanceof String && mWatchToken == null) {
            mWatchToken = newToken as String;
            Background.registerForTemporalEvent(new Time.Duration(syncPeriodSeconds()));
        }
        if (dict.hasKey("auth_failed")) {
            handleAuthFailure();
        } else if (dict.hasKey("sync_failed")) {
            view.setFetchFailed(0, "");
        } else if (dict.hasKey("registration_required")) {
            view.setRegistrationRequired(mDeviceCode);
        } else if (dict.hasKey("no_subscriptions")) {
            view.setNoSubscriptions();
        } else if (dict.hasKey("no_programme")) {
            view.setNoProgramme();
        } else if (dict.hasKey("programme_ready")) {
            // Service saved the programme to Storage before sending this sentinel.
            // Read from Storage rather than Background.exit data to avoid old-SDK
            // serialisation issues with nested Arrays of Dictionaries.
            var cached = Application.Storage.getValue("programme");
            if (cached instanceof Dictionary) {
                view.setProgramme(cached as Dictionary);
            }
        } else {
            view.setProgramme(dict);
        }
    }

    // Handles the response from /api/sync/:device_code.
    // 200 → { "programmes": [...], "subscription_count": N } — find today's and load it,
    //        or show the appropriate empty state.
    // 401 → token missing or invalid — wipe token and device code, re-register.
    // Other → network error, keep whatever is cached.
    function onSyncResponse(responseCode as Number, data as Dictionary?) as Void {
        var view = mView;
        logIfSimHttpsMisconfigured(responseCode);
        if (responseCode == 200 && data != null) {
            var programmes = data["programmes"] as Array<Dictionary>;
            var prog = findNextProgramme(programmes);
            if (prog != null) {
                var compact = compressProgramme(prog as Dictionary);
                Application.Storage.setValue("programme", compact);
                Application.Storage.setValue("lastSyncTime", System.getTimer());
                if (view != null) {
                    view.setProgramme(compact);
                }
            } else if (view != null) {
                var subCount = data["subscription_count"];
                if (subCount instanceof Number && (subCount as Number) == 0) {
                    view.setNoSubscriptions();
                } else {
                    view.setNoProgramme();
                }
            }
        } else if (responseCode == 401) {
            handleAuthFailure();
        } else {
            var msg = "";
            if (data instanceof Dictionary) {
                var errVal = (data as Dictionary)["error"];
                if (errVal instanceof String) { msg = errVal as String; }
            }
            if (view != null) {
                view.setFetchFailed(responseCode, msg);
            }
        }

        // Successful sync: re-register temporal event so old-SDK devices switch from
        // the 5-min registration-detection cadence to the user-configured interval.
        if (responseCode == 200) {
            Background.registerForTemporalEvent(new Time.Duration(syncPeriodSeconds()));
        }

        // Retry any participation record that the immediate LAP-press POST may have missed.
        if (responseCode == 200) {
            var pendingId = Application.Storage.getValue("pending_participation_id");
            if (pendingId instanceof String) {
                var headers = { "Content-Type" => "application/json" } as Dictionary<String, String>;
                if (mWatchToken != null) {
                    headers["Authorization"] = "Bearer " + (mWatchToken as String);
                }
                Communications.makeWebRequest(
                    API_BASE + "/api/sessions/start",
                    { "device_code" => mDeviceCode, "programme_id" => pendingId as String },
                    {
                        :method       => Communications.HTTP_REQUEST_METHOD_POST,
                        :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON,
                        :headers      => headers
                    },
                    method(:onParticipationRetryResponse)
                );
                Application.Storage.deleteValue("pending_participation_id");
            }
        }
    }

    function handleAuthFailure() as Void {
        mWatchToken = null;
        if (clearAuthState()) {
            mDeviceCode = getOrCreateDeviceCode();
        }
        var view = mView;
        if (view != null) {
            view.setDeviceCode(mDeviceCode);
            view.setRegistrationRequired(mDeviceCode);
        }
    }

    function onParticipationRetryResponse(responseCode as Number, data as Dictionary?) as Void {
    }

    hidden function syncPeriodSeconds() as Number {
        // Old-SDK devices without a token use a 5-minute interval so background
        // temporal events detect registration promptly (foreground polling unavailable).
        var storedOldSdk = Application.Storage.getValue("is_old_sdk");
        var storedToken = Application.Storage.getValue("watch_token");
        if ((storedOldSdk instanceof Boolean) && (storedOldSdk as Boolean)
                && !(storedToken instanceof String)) {
            return 5 * 60;
        }
        var freq = Application.Properties.getValue("SyncFrequency");
        var minutes = (freq instanceof Number) ? (freq as Number) : 60;
        if (minutes < 5) { minutes = 5; }
        if (minutes > 720) { minutes = 720; }
        return minutes * 60;
    }

    // Called when the user toggles a setting via Garmin Connect / GCM.
    // The "Reset Leadout" boolean clears all stored state and restarts sync.
    function onSettingsChanged() as Void {
        var reset = Application.Properties.getValue("ResetState");
        if (reset instanceof Boolean && reset as Boolean) {
            Application.Storage.deleteValue("watch_token");
            Application.Storage.deleteValue("device_code");
            Application.Storage.deleteValue("programme");
            Application.Storage.deleteValue("lastSyncTime");
            Application.Storage.deleteValue("pending_participation_id");
            Application.Properties.setValue("ResetState", false);
            mWatchToken = null;
            mDeviceCode = getOrCreateDeviceCode();
            var view = mView;
            if (view != null) {
                view.setDeviceCode(mDeviceCode);
                view.reset();
            }
            makeSyncRequest(mDeviceCode, mWatchToken, method(:onSyncResponse));
        }
        Background.registerForTemporalEvent(new Time.Duration(syncPeriodSeconds()));
    }

}

function getApp() as leadout_datafieldApp {
    return Application.getApp() as leadout_datafieldApp;
}
