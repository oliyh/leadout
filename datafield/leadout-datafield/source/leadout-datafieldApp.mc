import Toybox.Application;
import Toybox.Background;
import Toybox.Communications;
import Toybox.Lang;
import Toybox.System;
import Toybox.Time;
import Toybox.WatchUi;

class leadout_datafieldApp extends Application.AppBase {

    hidden var mView as leadout_datafieldView?;

    function initialize() {
        AppBase.initialize();
    }

    function onStart(state as Dictionary?) as Void {
        // Register background temporal sync — 5 minutes (platform minimum).
        // Fires while the native activity app is running. This call persists the
        // registration across app launches; re-calling on each start is safe.
        Background.registerForTemporalEvent(new Time.Duration(5 * 60));

        // Foreground sync: best-effort on open. A failed sync never wipes local
        // storage — the view falls back to the last successfully cached programme.
        Communications.makeWebRequest(
            API_BASE + "/api/public/programme/latest",
            null,
            {
                :method => Communications.HTTP_REQUEST_METHOD_GET,
                :responseType => Communications.HTTP_RESPONSE_CONTENT_TYPE_JSON
            },
            method(:onProgrammeFetched)
        );
    }

    function onStop(state as Dictionary?) as Void {
    }

    function getServiceDelegate() as [System.ServiceDelegate] {
        return [new LeadoutServiceDelegate()];
    }

    function getInitialView() as [Views] or [Views, InputDelegates] {
        mView = new leadout_datafieldView();
        return [mView];
    }

    function onBackgroundData(data as Application.PersistableType) as Void {
        var view = mView;
        if (data instanceof Dictionary && view != null) {
            view.setProgramme(data as Dictionary);
        }
    }

    function onProgrammeFetched(responseCode as Number, data as Dictionary?) as Void {
        System.println("onProgrammeFetched: code=" + responseCode + " data=" + (data != null ? data.toString() : "null"));
        var view = mView;
        if (responseCode == 200 && data != null) {
            Application.Storage.setValue("programme", data);
            Application.Storage.setValue("lastSyncTime", System.getTimer());
            if (view != null) {
                view.setProgramme(data);
            }
        } else {
            if (view != null) {
                view.setFetchFailed();
            }
        }
    }

}

function getApp() as leadout_datafieldApp {
    return Application.getApp() as leadout_datafieldApp;
}
